"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

import type { EmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";

import {
  AccountLockoutService,
  TimingAttackProtection,
  InputSanitizer,
  ACCOUNT_LOCKOUT_CONFIG,
  type LockoutResult,
  type LockoutStatus,
} from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit/index";
import { hasAuthErrorCode, isResetPasswordResult } from "@core/supabase/auth-guards";
import { createClient } from "@core/supabase/server";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { formatUtcToJst } from "@core/utils/timezone";
import { loginInputSchema, registerInputSchema } from "@core/validation/auth";

// バリデーションスキーマ
const resetPasswordSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
});

const verifyOtpSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  otp: z.string().regex(/^\d{6}$/, "6桁の数字を入力してください"),
  type: z.enum(["email", "recovery", "email_change", "signup"]),
});

const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128, "パスワードは128文字以内で入力してください"),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

// FormDataをオブジェクトに変換
function formDataToObject(formData: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value.toString();
  }
  return data;
}

/**
 * ログイン
 */
export async function loginAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  try {
    const rawData = formDataToObject(formData);
    const result = loginInputSchema.safeParse(rawData);

    if (!result.success) {
      // タイミング攻撃対策: バリデーションエラー時も一定時間待機
      await TimingAttackProtection.addConstantDelay();
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    // 入力値サニタイゼーション
    let sanitizedEmail: string;
    let sanitizedPassword: string;
    try {
      sanitizedEmail = InputSanitizer.sanitizeEmail(email);
      sanitizedPassword = InputSanitizer.sanitizePassword(password);
    } catch {
      // sanitizeError
      await TimingAttackProtection.addConstantDelay();
      return fail("VALIDATION_ERROR", { userMessage: "入力内容を確認してください" });
    }

    // レート制限チェック（ip + emailHash の AND）
    try {
      const headersList = headers();
      const ip = getClientIPFromHeaders(headersList);
      const keyInput = buildKey({ scope: "auth.login", ip, email: sanitizedEmail });
      const rateLimitResult = await enforceRateLimit({
        keys: Array.isArray(keyInput) ? keyInput : [keyInput],
        policy: POLICIES["auth.login"],
      });
      if (!rateLimitResult.allowed) {
        await TimingAttackProtection.addConstantDelay();
        return fail("RATE_LIMITED", {
          userMessage: "ログイン試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          retryable: true,
        });
      }
    } catch (rateLimitError) {
      logger.warn("Rate limit check failed", {
        category: "security",
        action: "rateLimitCheckFailed",
        error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
        error_message:
          rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
      });
    }

    // アカウントロックアウト状態確認
    const lockoutStatus: LockoutStatus =
      await AccountLockoutService.checkLockoutStatus(sanitizedEmail);
    if (lockoutStatus.isLocked) {
      await TimingAttackProtection.normalizeResponseTime(async () => {}, 300);
      return fail("FORBIDDEN", {
        userMessage: `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt ? formatUtcToJst(lockoutStatus.lockoutExpiresAt, "HH:mm") : ""}頃に再試行してください。`,
      });
    }
    const supabase = createClient();

    // ログイン試行実行（タイミング攻撃対策付き）
    const authResult = await TimingAttackProtection.normalizeResponseTime(
      async () =>
        await supabase.auth.signInWithPassword({
          email: sanitizedEmail,
          password: sanitizedPassword,
        }),
      300
    );

    const { data: signInData, error: signInError } = authResult;

    if (signInError) {
      handleServerError(signInError, {
        category: "authentication",
        action: "loginFailed",
        additionalData: {
          sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      // ログイン失敗をアカウントロックアウトに記録
      const lockoutResult: LockoutResult =
        await AccountLockoutService.recordFailedAttempt(sanitizedEmail);

      // アカウントロックアウトが発生した場合
      if (lockoutResult.isLocked) {
        await TimingAttackProtection.addConstantDelay();
        return fail("FORBIDDEN", {
          userMessage: "アカウントがロックされました。しばらく時間をおいてからお試しください。",
        });
      }

      // 未確認メールエラーの特別処理
      if (hasAuthErrorCode(signInError, "email_not_confirmed")) {
        return fail("LOGIN_FAILED", {
          userMessage: "メールアドレスの確認が必要です。",
          redirectUrl: `/verify-email?email=${encodeURIComponent(sanitizedEmail)}`,
          needsVerification: true,
        });
      }

      // ユーザー列挙攻撃対策: 統一されたエラーメッセージ
      let errorMessage = "メールアドレスまたはパスワードが正しくありません";

      // アカウントロック警告
      if (lockoutResult.isLocked) {
        errorMessage = `ログイン試行回数が上限に達しました。アカウントがロックされています。`;
      } else if (lockoutResult.failedAttempts >= 3) {
        const config = ACCOUNT_LOCKOUT_CONFIG;
        const remaining = config.maxFailedAttempts - lockoutResult.failedAttempts;
        errorMessage += ` (残り${remaining}回の試行でアカウントがロックされます)`;
      }

      return fail("LOGIN_FAILED", { userMessage: errorMessage });
    }

    // ログイン成功: 失敗回数とロックをクリア
    await AccountLockoutService.clearFailedAttempts(sanitizedEmail);

    // GA4: ログインイベントを送信（非同期、エラーは無視）
    waitUntil(
      (async () => {
        try {
          const { ga4Server } = await import("@core/analytics/ga4-server");

          // _ga CookieからClient IDを取得
          const cookieStore = await cookies();
          const gaCookie = cookieStore.get("_ga")?.value;
          const clientId = extractClientIdFromGaCookie(gaCookie);

          // ユーザーIDを取得（Client IDがない場合のフォールバック）
          const userId = signInData?.user?.id;

          await ga4Server.sendEvent(
            {
              name: "login",
              params: {
                method: "password",
              },
            },
            clientId ?? undefined,
            userId,
            undefined, // sessionId（現時点では未設定）
            undefined // engagementTimeMsec（現時点では未設定）
          );
        } catch (error) {
          // GA4送信エラーはログインの成功に影響しない
          logger.debug("[GA4] Failed to send login event", {
            category: "system",
            action: "ga4LoginEventFailed",
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      })()
    );

    // ログイン成功（メール確認済み）
    return ok(
      { user: signInData?.user },
      { message: "ログインしました", redirectUrl: "/dashboard" }
    );
  } catch (error) {
    handleServerError("LOGIN_UNEXPECTED_ERROR", {
      action: "loginActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    // タイミング攻撃対策: エラー時も一定時間確保
    await TimingAttackProtection.addConstantDelay();
    return fail("LOGIN_UNEXPECTED_ERROR", { userMessage: "ログイン処理中にエラーが発生しました" });
  }
}

/**
 * ユーザー登録
 */
export async function registerAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  try {
    const rawData = formDataToObject(formData);
    const result = registerInputSchema.safeParse(rawData);

    if (!result.success) {
      await TimingAttackProtection.addConstantDelay();
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { name, email, password } = result.data;

    // 入力値サニタイゼーション（Zodバリデーション後なので基本的なサニタイゼーションのみ）
    const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(password);
    const sanitizedName = name.trim();

    // レート制限チェック（ip + emailHash の AND）
    try {
      const headersList = headers();
      const ip = getClientIPFromHeaders(headersList);
      const keyInput = buildKey({ scope: "auth.register", ip, email: sanitizedEmail });
      const rateLimitResult = await enforceRateLimit({
        keys: Array.isArray(keyInput) ? keyInput : [keyInput],
        policy: POLICIES["auth.register"],
      });
      if (!rateLimitResult.allowed) {
        await TimingAttackProtection.addConstantDelay();
        return fail("RATE_LIMITED", {
          userMessage: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          retryable: true,
        });
      }
    } catch (rateLimitError) {
      logger.warn("Rate limit check failed during registration", {
        category: "security",
        action: "rateLimitCheckFailed",
        error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
        error_message:
          rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
      });
    }

    const supabase = createClient();

    // ユーザー登録（メール確認必須）
    const registrationResult = await TimingAttackProtection.normalizeResponseTime(
      async () =>
        await supabase.auth.signUp({
          email: sanitizedEmail,
          password: sanitizedPassword,
          options: {
            data: {
              name: sanitizedName,
              terms_agreed: true,
            },
            // メール確認後のリダイレクト先は設定しない（OTP方式を使用）
          },
        }),
      400
    );

    const { data: signUpData, error: signUpError } = registrationResult;

    if (signUpError) {
      handleServerError(signUpError, {
        category: "authentication",
        action: "registrationFailed",
        additionalData: {
          sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      // ユーザー列挙攻撃対策: 詳細なエラー情報を隠す
      let errorMessage = "登録処理中にエラーが発生しました";
      let errorCode: "ALREADY_EXISTS" | "RATE_LIMITED" | "REGISTRATION_UNEXPECTED_ERROR" =
        "REGISTRATION_UNEXPECTED_ERROR";

      if (hasAuthErrorCode(signUpError, "user_already_exists")) {
        // 既存ユーザー情報の漏洩を防ぐため、統一されたメッセージ
        errorMessage = "このメールアドレスは既に登録されています";
        errorCode = "ALREADY_EXISTS";
      } else if (hasAuthErrorCode(signUpError, "over_email_send_limit")) {
        errorMessage = "送信回数の上限に達しました。しばらく時間をおいてからお試しください";
        errorCode = "RATE_LIMITED";
      }

      return fail(errorCode, {
        userMessage: errorMessage,
        retryable: errorCode === "RATE_LIMITED",
      });
    }

    // Database Triggerがpublic.usersプロファイルを自動作成

    // GA4: サインアップイベントを送信（非同期、エラーは無視）
    waitUntil(
      (async () => {
        try {
          const { ga4Server } = await import("@core/analytics/ga4-server");

          // _ga CookieからClient IDを取得
          const cookieStore = await cookies();
          const gaCookie = cookieStore.get("_ga")?.value;
          const clientId = extractClientIdFromGaCookie(gaCookie);

          // ユーザーIDを取得（Client IDがない場合のフォールバック）
          const userId = signUpData?.user?.id;

          await ga4Server.sendEvent(
            {
              name: "sign_up",
              params: {
                method: "password",
              },
            },
            clientId ?? undefined,
            userId,
            undefined, // sessionId（現時点では未設定）
            undefined // engagementTimeMsec（現時点では未設定）
          );
        } catch (error) {
          logger.debug("[GA4] Failed to send sign_up event", {
            category: "system",
            action: "ga4SignUpEventFailed",
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      })()
    );

    // Slack通知（新規アカウント作成）
    waitUntil(
      (async () => {
        try {
          const timestamp = new Date().toISOString();
          const jstStr = formatUtcToJst(new Date(), "yyyy-MM-dd HH:mm 'JST'");

          const slackText = `[Account Created]
ユーザー: ${sanitizedName}
登録時刻: ${jstStr} (${timestamp})`;

          const slackResult = await sendSlackText(slackText);

          if (!slackResult.success) {
            logger.warn("Account creation Slack notification failed", {
              category: "system",
              action: "accountCreationSlackFailed",
              error_message: slackResult.error.message,
              error_code: slackResult.error.code,
              retryable: slackResult.error.retryable,
              error_details: slackResult.error.details,
            });
          }
        } catch (error) {
          handleServerError("ADMIN_ALERT_FAILED", {
            category: "system",
            action: "accountCreationSlackException",
            actorType: "system",
            additionalData: {
              error_message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      })()
    );

    // 登録成功（メール確認が必要）
    return ok(
      { user: signUpData?.user },
      {
        needsVerification: true,
        message: "登録が完了しました。確認メールを送信しました。",
        redirectUrl: `/verify-otp?email=${encodeURIComponent(sanitizedEmail)}`,
      }
    );
  } catch (error) {
    handleServerError("REGISTRATION_UNEXPECTED_ERROR", {
      action: "registerActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return fail("REGISTRATION_UNEXPECTED_ERROR", {
      userMessage: "登録処理中にエラーが発生しました",
    });
  }
}

/**
 * OTP検証
 */
export async function verifyOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = verifyOtpSchema.safeParse(rawData);

    if (!result.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { email, otp, type } = result.data;
    const supabase = createClient();

    const { error: verifiedError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: type as EmailOtpType,
    });

    if (verifiedError) {
      handleServerError(verifiedError, {
        category: "authentication",
        action: "otpVerificationFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      let errorMessage = "確認コードが正しくありません";
      let errorCode: "OTP_INVALID" | "OTP_EXPIRED" = "OTP_INVALID";
      if (hasAuthErrorCode(verifiedError, "otp_expired")) {
        errorMessage = "確認コードが無効、もしくは有効期限が切れています";
        errorCode = "OTP_EXPIRED";
      } else if (hasAuthErrorCode(verifiedError, "otp_invalid")) {
        errorMessage = "無効な確認コードです";
        errorCode = "OTP_INVALID";
      }

      return fail(errorCode, { userMessage: errorMessage });
    }

    // タイプに応じてリダイレクト先を決定
    let redirectUrl = "/dashboard";
    let message = "メールアドレスが確認されました";

    if (type === "recovery") {
      redirectUrl = "/reset-password/update";
      message = "パスワードリセットの確認が完了しました";
    } else if (type === "email") {
      redirectUrl = "/dashboard";
      message = "メールアドレスが確認されました";
    } else if (type === "email_change") {
      redirectUrl = "/settings";
      message = "メールアドレス変更が完了しました";
    } else if (type === "signup") {
      redirectUrl = "/dashboard";
      message = "アカウント登録が完了しました";
    }

    return ok(undefined, { message, redirectUrl });
  } catch (error) {
    handleServerError("OTP_UNEXPECTED_ERROR", {
      action: "verifyOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return fail("OTP_UNEXPECTED_ERROR", { userMessage: "確認処理中にエラーが発生しました" });
  }
}

/**
 * OTP再送信
 */
export async function resendOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const email = formData.get("email")?.toString();
    const type = formData.get("type")?.toString() || "signup";

    if (!email || !z.string().email().safeParse(email).success) {
      return fail("VALIDATION_ERROR", { userMessage: "有効なメールアドレスを入力してください" });
    }

    // レート制限チェック（ip + emailHash の AND）
    try {
      const headersList = headers();
      const ip = getClientIPFromHeaders(headersList);
      const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
      const keyInput = buildKey({ scope: "auth.emailResend", ip, email: sanitizedEmail });
      const rateLimitResult = await enforceRateLimit({
        keys: Array.isArray(keyInput) ? keyInput : [keyInput],
        policy: POLICIES["auth.emailResend"],
      });
      if (!rateLimitResult.allowed) {
        return fail("RATE_LIMITED", {
          userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
          retryable: true,
        });
      }
    } catch (rateLimitError) {
      logger.warn("Rate limit check failed during email resend", {
        category: "security",
        action: "rateLimitCheckFailed",
        error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
        error_message:
          rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
      });
    }

    const supabase = createClient();

    // タイプに応じて適切なメソッドを呼び出し
    let result;
    if (type === "recovery") {
      result = await supabase.auth.resetPasswordForEmail(email);
    } else if (type === "signup" || type === "email_change") {
      result = await supabase.auth.resend({
        type: type as "signup" | "email_change",
        email,
      });
    } else {
      // phone_change, sms などは現在サポートしていない
      return fail("INVALID_REQUEST", {
        userMessage: "このタイプの再送信は現在サポートしていません",
      });
    }

    const { error } = result;

    if (error) {
      handleServerError(error, {
        category: "authentication",
        action: "resendOtpFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      if (hasAuthErrorCode(error, "over_email_send_limit")) {
        return fail("RATE_LIMITED", {
          userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
          retryable: true,
        });
      }

      return fail("RESEND_OTP_UNEXPECTED_ERROR", {
        userMessage: "再送信中にエラーが発生しました",
      });
    }

    return ok(undefined, { message: "確認コードを再送信しました" });
  } catch (error) {
    handleServerError("RESEND_OTP_UNEXPECTED_ERROR", {
      action: "resendOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return fail("RESEND_OTP_UNEXPECTED_ERROR", {
      userMessage: "再送信中にエラーが発生しました",
    });
  }
}

/**
 * パスワードリセット要求
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = resetPasswordSchema.safeParse(rawData);

    if (!result.success) {
      await TimingAttackProtection.addConstantDelay();
      return fail("VALIDATION_ERROR", {
        userMessage: "有効なメールアドレスを入力してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    let { email } = result.data;

    // 入力値サニタイゼーション
    try {
      email = InputSanitizer.sanitizeEmail(email);
    } catch {
      // sanitizeError
      await TimingAttackProtection.addConstantDelay();
      return fail("VALIDATION_ERROR", { userMessage: "有効なメールアドレスを入力してください" });
    }
    // レート制限チェック（ip + emailHash の AND）
    try {
      const headersList = headers();
      const ip = getClientIPFromHeaders(headersList);
      const keyInput = buildKey({ scope: "auth.passwordReset", ip, email });
      const rateLimitResult = await enforceRateLimit({
        keys: Array.isArray(keyInput) ? keyInput : [keyInput],
        policy: POLICIES["auth.passwordReset"],
      });
      if (!rateLimitResult.allowed) {
        await TimingAttackProtection.addConstantDelay();
        return fail("RATE_LIMITED", {
          userMessage:
            "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          retryable: true,
        });
      }
    } catch (rateLimitError) {
      logger.warn("Rate limit check failed during password reset", {
        category: "security",
        action: "rateLimitCheckFailed",
        error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
        error_message:
          rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
      });
    }
    const supabase = createClient();

    // タイミング攻撃対策: 常に一定時間確保
    const resetResult = await TimingAttackProtection.normalizeResponseTime(
      async () => await supabase.auth.resetPasswordForEmail(email),
      300
    );

    // セキュリティ上、成功・失敗に関わらず同じメッセージを返す（ユーザー列挙攻撃対策）
    // エラーがあってもログに記録するだけで、ユーザーには同じメッセージを返す
    if (isResetPasswordResult(resetResult) && resetResult.error) {
      handleServerError(resetResult.error, {
        category: "authentication",
        action: "resetPasswordOtpFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });
    }

    // セキュリティ上、成功・失敗に関わらず同じメッセージを返す（ユーザー列挙攻撃対策）
    return ok(undefined, {
      message: "パスワードリセット用の確認コードを送信しました（登録済みのアドレスの場合）",
      needsVerification: true,
      redirectUrl: `/verify-otp?email=${encodeURIComponent(email)}&type=recovery`,
    });
  } catch (error) {
    handleServerError("RESET_PASSWORD_UNEXPECTED_ERROR", {
      action: "resetPasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return fail("RESET_PASSWORD_UNEXPECTED_ERROR", {
      userMessage: "処理中にエラーが発生しました",
    });
  }
}

/**
 * パスワード更新（リセット後）
 */
export async function updatePasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = updatePasswordSchema.safeParse(rawData);

    if (!result.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { password } = result.data;
    const supabase = createClient();

    // セッション存在チェック
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return fail("TOKEN_EXPIRED", {
        userMessage: "セッションが期限切れです。確認コードを再入力してください",
        redirectUrl: "/verify-otp",
      });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      handleServerError(updateError, {
        category: "authentication",
        action: "updatePasswordFailed",
        actorType: "user",
      });
      return fail("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "パスワードの更新に失敗しました",
      });
    }

    return ok(undefined, { message: "パスワードが更新されました", redirectUrl: "/dashboard" });
  } catch (error) {
    handleServerError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      action: "updatePasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return fail("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      userMessage: "処理中にエラーが発生しました",
    });
  }
}

/**
 * ログアウト
 */
export async function logoutAction(): Promise<ActionResult> {
  try {
    const supabase = createClient();

    // ユーザーIDを取得（GA4イベント送信用）
    let userId: string | undefined;
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id;
    } catch {
      // ユーザー取得エラーは無視
    }

    // ログアウト実行（認証状態に関係なく実行）
    const { error } = await supabase.auth.signOut();

    revalidatePath("/", "layout");

    if (error) {
      logger.warn("Logout error (non-critical)", {
        category: "authentication",
        action: "logoutError",
        error_message: error.message,
      });
    }

    // GA4: ログアウトイベントを送信（非同期、エラーは無視）
    waitUntil(
      (async () => {
        try {
          const { ga4Server } = await import("@core/analytics/ga4-server");

          // _ga CookieからClient IDを取得
          const cookieStore = await cookies();
          const gaCookie = cookieStore.get("_ga")?.value;
          const clientId = extractClientIdFromGaCookie(gaCookie);

          await ga4Server.sendEvent(
            {
              name: "logout",
              params: {},
            },
            clientId ?? undefined,
            userId,
            undefined, // sessionId（現時点では未設定）
            undefined // engagementTimeMsec（現時点では未設定）
          );
        } catch (error) {
          logger.debug("[GA4] Failed to send logout event", {
            category: "system",
            action: "ga4LogoutEventFailed",
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      })()
    );

    return ok(undefined, { message: "ログアウトしました", redirectUrl: "/login" });
  } catch (error) {
    handleServerError("LOGOUT_UNEXPECTED_ERROR", {
      action: "logoutActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return fail("LOGOUT_UNEXPECTED_ERROR", {
      userMessage: "ログアウト処理中にエラーが発生しました。再度お試しください。",
      redirectUrl: "/login",
    });
  }
}
