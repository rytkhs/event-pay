"use server";

import { headers } from "next/headers";

import type { EmailOtpType, AuthResponse } from "@supabase/supabase-js";
import { z } from "zod";

import {
  AccountLockoutService,
  TimingAttackProtection,
  InputSanitizer,
  ACCOUNT_LOCKOUT_CONFIG,
  TEST_ACCOUNT_LOCKOUT_CONFIG,
  type LockoutResult,
  type LockoutStatus,
} from "@core/auth-security";
import { logger } from "@core/logging/app-logger";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit/index";
import { createClient } from "@core/supabase/server";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { formatUtcToJst } from "@core/utils/timezone";

// バリデーションスキーマ
const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
  password: z.string().min(1, "パスワードを入力してください").max(128),
});

const registerSchema = z
  .object({
    name: z
      .string()
      .transform((str) => str.trim()) // 最初にトリム
      .refine((trimmed) => trimmed.length >= 1, {
        message: "名前を入力してください",
      })
      .refine((trimmed) => trimmed.length <= 100, {
        message: "名前は100文字以内で入力してください",
      })
      .refine(
        (trimmed) => {
          // NULL文字やcontrol文字のチェック
          if (trimmed.includes("\0") || trimmed.includes("\x1a")) {
            return false;
          }
          // 危険な特殊文字のチェック（アポストロフィと引用符は許可）
          if (/[;&|`$(){}[\]<>\\]/.test(trimmed)) {
            return false;
          }
          // コマンドインジェクション対策（完全なコマンド形式のみ拒否）
          if (
            /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
              trimmed
            )
          ) {
            return false;
          }
          return true;
        },
        {
          message: "名前に無効な文字が含まれています",
        }
      ),
    email: z.string().email("有効なメールアドレスを入力してください").max(254),
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128)
      .regex(
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
        "パスワードは大文字・小文字・数字を含む必要があります"
      ),
    passwordConfirm: z.string(),
    termsAgreed: z.string().refine((value) => value === "true", {
      message: "利用規約に同意してください",
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

const resetPasswordSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
});

const verifyOtpSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  otp: z.string().regex(/^\d{6}$/, "6桁の数字を入力してください"),
  type: z.enum(["signup", "recovery", "email_change"]),
});

const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128)
      .regex(
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
        "パスワードは大文字・小文字・数字を含む必要があります"
      ),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

// 共通結果型
export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectUrl?: string;
  needsVerification?: boolean;
};

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
    // CSRF対策: Origin/Refererヘッダーの検証（テスト環境では無効化）
    if (process.env.NODE_ENV !== "test") {
      const headersList = headers();
      const origin = headersList.get("origin");
      const referer = headersList.get("referer");
      const host = headersList.get("host");

      if (!origin && !referer) {
        await TimingAttackProtection.addConstantDelay();
        return {
          success: false,
          error: "不正なリクエストです",
        };
      }

      // 複数環境に対応した許可オリジン設定
      const getAllowedOrigins = () => {
        const origins = [];

        // ホストベースのオリジン
        if (host) {
          origins.push(`https://${host}`);
          origins.push(`http://${host}`);
        }

        // 本番環境URL
        if (process.env.NEXT_PUBLIC_SITE_URL) {
          origins.push(process.env.NEXT_PUBLIC_SITE_URL);
        }

        // 開発環境URL
        origins.push("http://localhost:3000");
        origins.push("https://localhost:3000");

        // Vercel Preview環境URL
        if (process.env.VERCEL_URL) {
          origins.push(`https://${process.env.VERCEL_URL}`);
        }

        // 追加の許可オリジン
        if (process.env.ALLOWED_ORIGINS) {
          const additionalOrigins = process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
          origins.push(...additionalOrigins);
        }

        return [...new Set(origins.filter(Boolean))]; // 重複と空文字を除去
      };

      const allowedOrigins = getAllowedOrigins();

      const isValidOrigin = origin && allowedOrigins.some((allowed) => origin === allowed);
      const isValidReferer =
        referer && allowedOrigins.some((allowed) => referer.startsWith(`${allowed}/`));

      if (!isValidOrigin && !isValidReferer) {
        await TimingAttackProtection.addConstantDelay();
        return {
          success: false,
          error: "CSRF攻撃を検出しました",
        };
      }
    }

    const rawData = formDataToObject(formData);
    const result = loginSchema.safeParse(rawData);

    if (!result.success) {
      // タイミング攻撃対策: バリデーションエラー時も一定時間待機
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
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
      return {
        success: false,
        error: "入力内容を確認してください",
      };
    }

    // レート制限チェック（ip + emailHash の AND）
    if (process.env.NODE_ENV !== "test") {
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
          return {
            success: false,
            error: "ログイン試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch (rateLimitError) {
        logger.warn("Rate limit check failed", {
          tag: "rateLimitCheckFailed",
          error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
          error_message:
            rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
        });
      }
    }

    // アカウントロックアウト状態確認
    const lockoutStatus: LockoutStatus =
      await AccountLockoutService.checkLockoutStatus(sanitizedEmail);
    if (lockoutStatus.isLocked) {
      await TimingAttackProtection.normalizeResponseTime(async () => {}, 300);
      return {
        success: false,
        error: `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt ? formatUtcToJst(lockoutStatus.lockoutExpiresAt, "HH:mm") : ""}頃に再試行してください。`,
      };
    }
    const supabase = createClient();

    // ログイン試行実行（タイミング攻撃対策付き）
    let authResult: AuthResponse | null = null;
    await TimingAttackProtection.normalizeResponseTime(async () => {
      authResult = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password: sanitizedPassword,
      });
    }, 300);

    if (!authResult) {
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        error: "ログイン処理中にエラーが発生しました",
      };
    }
    const { data: signInData, error: signInError } = authResult as AuthResponse;

    if (signInError) {
      logger.error("Login authentication failed", {
        tag: "loginFailed",
        error_message: (signInError as any)?.message ?? String(signInError),
        sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
      });

      // ログイン失敗をアカウントロックアウトに記録
      const lockoutResult: LockoutResult =
        await AccountLockoutService.recordFailedAttempt(sanitizedEmail);

      // アカウントロックアウトが発生した場合
      if (lockoutResult.isLocked) {
        await TimingAttackProtection.addConstantDelay();
        return {
          success: false,
          error: `アカウントがロックされました。しばらく時間をおいてからお試しください。`,
        };
      }

      // 未確認メールエラーの特別処理
      if (
        typeof (signInError as unknown) === "object" &&
        signInError !== null &&
        "message" in (signInError as any) &&
        typeof (signInError as any).message === "string" &&
        (signInError as any).message === "Email not confirmed"
      ) {
        try {
          // 開発環境では確認メールを自動再送信
          if (process.env.NODE_ENV === "development") {
            const { error: resendError } = await supabase.auth.resend({
              type: "signup",
              email: sanitizedEmail,
            });

            if (resendError) {
              logger.error("Email confirmation resend failed", {
                tag: "emailResendFailed",
                error_message: resendError.message,
                sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
              });
            }
          }

          return {
            success: false,
            error: "メールアドレスの確認が必要です。確認メールを再送信しました。",
            redirectUrl: `/verify-email?email=${encodeURIComponent(sanitizedEmail)}`,
          };
        } catch (resendError) {
          logger.error("Email resend process failed", {
            tag: "emailResendProcessFailed",
            error_name: resendError instanceof Error ? resendError.name : "Unknown",
            error_message: resendError instanceof Error ? resendError.message : String(resendError),
            sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
          });

          return {
            success: false,
            error: "メールアドレスの確認が必要です。",
            redirectUrl: `/verify-email?email=${encodeURIComponent(sanitizedEmail)}`,
          };
        }
      }

      // ユーザー列挙攻撃対策: 統一されたエラーメッセージ
      let errorMessage = "メールアドレスまたはパスワードが正しくありません";

      // アカウントロック警告
      if (lockoutResult.isLocked) {
        errorMessage = `ログイン試行回数が上限に達しました。アカウントがロックされています。`;
      } else if (lockoutResult.failedAttempts >= 3) {
        const config =
          process.env.NODE_ENV === "test" ? TEST_ACCOUNT_LOCKOUT_CONFIG : ACCOUNT_LOCKOUT_CONFIG;
        const remaining = config.maxFailedAttempts - lockoutResult.failedAttempts;
        errorMessage += ` (残り${remaining}回の試行でアカウントがロックされます)`;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // ログイン成功: 失敗回数とロックをクリア
    await AccountLockoutService.clearFailedAttempts(sanitizedEmail);

    // ログイン成功（メール確認済み）
    return {
      success: true,
      data: { user: signInData?.user },
      message: "ログインしました",
      redirectUrl: "/dashboard",
    };
  } catch (error) {
    logger.error("Login action error", {
      tag: "loginActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    // タイミング攻撃対策: エラー時も一定時間確保
    await TimingAttackProtection.addConstantDelay();
    return {
      success: false,
      error: "ログイン処理中にエラーが発生しました",
    };
  }
}

/**
 * ユーザー登録
 */
export async function registerAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  try {
    const rawData = formDataToObject(formData);
    const result = registerSchema.safeParse(rawData);

    if (!result.success) {
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { name, email, password, termsAgreed } = result.data;

    // 利用規約同意チェック
    if (termsAgreed !== "true") {
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: {
          termsAgreed: ["利用規約に同意してください"],
        },
        error: "利用規約に同意してください",
      };
    }

    // 入力値サニタイゼーション（Zodバリデーション後なので基本的なサニタイゼーションのみ）
    const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(password);
    const sanitizedName = name.trim();

    // レート制限チェック（ip + emailHash の AND）
    if (process.env.NODE_ENV !== "test") {
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
          return {
            success: false,
            error: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch (rateLimitError) {
        logger.warn("Rate limit check failed during registration", {
          tag: "rateLimitCheckFailed",
          error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
          error_message:
            rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
        });
      }
    }

    const supabase = createClient();

    // ユーザー登録（メール確認必須）
    let registrationResult: AuthResponse | null = null;
    await TimingAttackProtection.normalizeResponseTime(async () => {
      registrationResult = await supabase.auth.signUp({
        email: sanitizedEmail,
        password: sanitizedPassword,
        options: {
          data: {
            name: sanitizedName,
            terms_agreed: true,
          },
          // メール確認後のリダイレクト先は設定しない（OTP方式を使用）
        },
      });
    }, 400);

    if (!registrationResult) {
      return {
        success: false,
        error: "登録処理中にエラーが発生しました",
      };
    }
    const { data: signUpData, error: signUpError } = registrationResult as AuthResponse;

    if (signUpError) {
      logger.error("User registration failed", {
        tag: "registrationFailed",
        error_message: (signUpError as any)?.message ?? String(signUpError),
        sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
      });

      // ユーザー列挙攻撃対策: 詳細なエラー情報を隠す
      let errorMessage = "登録処理中にエラーが発生しました";

      if (
        typeof (signUpError as unknown) === "object" &&
        signUpError !== null &&
        "message" in (signUpError as any) &&
        typeof (signUpError as any).message === "string"
      ) {
        if ((signUpError as any).message.includes("already registered")) {
          // 既存ユーザー情報の漏洩を防ぐため、統一されたメッセージ
          errorMessage = "このメールアドレスは既に登録されています";
        } else if ((signUpError as any).message.includes("rate limit")) {
          errorMessage = "送信回数の上限に達しました。しばらく時間をおいてからお試しください";
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // Database Triggerがpublic.usersプロファイルを自動作成

    // 登録成功（メール確認が必要）
    return {
      success: true,
      data: { user: signUpData?.user },
      needsVerification: true,
      message: "登録が完了しました。確認メールを送信しました。",
      redirectUrl: `/verify-otp?email=${encodeURIComponent(sanitizedEmail)}`,
    };
  } catch (error) {
    logger.error("Register action error", {
      tag: "registerActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    await TimingAttackProtection.addConstantDelay();
    return {
      success: false,
      error: "登録処理中にエラーが発生しました",
    };
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
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { email, otp, type } = result.data;
    const supabase = createClient();

    const { data: verifiedData, error: verifiedError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: type as EmailOtpType,
    });

    if (verifiedError) {
      logger.error("OTP verification failed", {
        tag: "otpVerificationFailed",
        error_message: (verifiedError as any)?.message ?? String(verifiedError),
        sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
      });

      let errorMessage = "確認コードが正しくありません";
      if ((verifiedError as any)?.message?.includes("expired")) {
        errorMessage = "確認コードの有効期限が切れています";
      } else if ((verifiedError as any)?.message?.includes("invalid")) {
        errorMessage = "無効な確認コードです";
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // OTP確認成功後、ユーザープロファイル作成
    if (type === "signup" && verifiedData?.user) {
      try {
        const { error: profileError } = await supabase.from("users").insert({
          id: verifiedData.user.id,
          name: verifiedData.user.user_metadata?.name || "",
        });

        if (profileError) {
          logger.error("Profile creation failed", {
            tag: "profileCreationFailed",
            user_id: verifiedData.user.id,
            error_message: profileError.message,
          });
          // プロファイル作成エラーは非致命的として扱う
        }
      } catch (profileError) {
        logger.error("Profile creation error", {
          tag: "profileCreationError",
          user_id: verifiedData.user?.id,
          error_name: profileError instanceof Error ? profileError.name : "Unknown",
          error_message:
            profileError instanceof Error ? profileError.message : String(profileError),
        });
      }
    }

    return {
      success: true,
      message: "メールアドレスが確認されました",
      redirectUrl: "/dashboard",
    };
  } catch (error) {
    logger.error("Verify OTP action error", {
      tag: "verifyOtpActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "確認処理中にエラーが発生しました",
    };
  }
}

/**
 * OTP再送信
 */
export async function resendOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const email = formData.get("email")?.toString();

    if (!email || !z.string().email().safeParse(email).success) {
      return {
        success: false,
        error: "有効なメールアドレスを入力してください",
      };
    }

    // レート制限チェック（ip + emailHash の AND）
    if (process.env.NODE_ENV !== "test") {
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
          return {
            success: false,
            error: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch (rateLimitError) {
        logger.warn("Rate limit check failed during email resend", {
          tag: "rateLimitCheckFailed",
          error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
          error_message:
            rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
        });
      }
    }

    const supabase = createClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      logger.error("Resend OTP failed", {
        tag: "resendOtpFailed",
        error_message: (error as any)?.message ?? String(error),
        sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
      });

      if ((error as any)?.message?.includes("rate limit")) {
        return {
          success: false,
          error: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        };
      }

      return {
        success: false,
        error: "再送信中にエラーが発生しました",
      };
    }

    return {
      success: true,
      message: "確認コードを再送信しました",
    };
  } catch (error) {
    logger.error("Resend OTP action error", {
      tag: "resendOtpActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "再送信中にエラーが発生しました",
    };
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
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "有効なメールアドレスを入力してください",
      };
    }

    let { email } = result.data;

    // 入力値サニタイゼーション
    try {
      email = InputSanitizer.sanitizeEmail(email);
    } catch {
      // sanitizeError
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        error: "有効なメールアドレスを入力してください",
      };
    }
    // レート制限チェック（ip + emailHash の AND）
    if (process.env.NODE_ENV !== "test") {
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
          return {
            success: false,
            error:
              "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch (rateLimitError) {
        logger.warn("Rate limit check failed during password reset", {
          tag: "rateLimitCheckFailed",
          error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
          error_message:
            rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
        });
      }
    }
    const supabase = createClient();

    // タイミング攻撃対策: 常に一定時間確保
    let resetResult: { data: unknown; error: unknown } | null = null;
    await TimingAttackProtection.normalizeResponseTime(async () => {
      resetResult = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/update`,
      });
    }, 300);

    if (!resetResult) {
      // セキュリティ上、成功・失敗に関わらず同じメッセージを返す（ユーザー列挙攻撃対策）
      return {
        success: true,
        message: "パスワードリセットメールを送信しました（登録済みのアドレスの場合）",
      };
    }
    const { error } = resetResult;

    if (error) {
      logger.error("Reset password failed", {
        tag: "resetPasswordFailed",
        error_message: (error as any)?.message ?? String(error),
        sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
      });
    }

    // セキュリティ上、成功・失敗に関わらず同じメッセージを返す（ユーザー列挙攻撃対策）
    return {
      success: true,
      message: "パスワードリセットメールを送信しました（登録済みのアドレスの場合）",
    };
  } catch (error) {
    logger.error("Reset password action error", {
      tag: "resetPasswordActionError",
      error_name: (error as any)?.name ?? "Unknown",
      error_message: (error as any)?.message ?? String(error),
    });
    await TimingAttackProtection.addConstantDelay();
    return {
      success: false,
      error: "処理中にエラーが発生しました",
    };
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
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { password } = result.data;
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      logger.error("Update password failed", {
        tag: "updatePasswordFailed",
        error_message: (error as any)?.message ?? String(error),
      });
      return {
        success: false,
        error: "パスワードの更新に失敗しました",
      };
    }

    return {
      success: true,
      message: "パスワードが更新されました",
      redirectUrl: "/dashboard",
    };
  } catch (error) {
    logger.error("Update password action error", {
      tag: "updatePasswordActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "処理中にエラーが発生しました",
    };
  }
}

/**
 * ログアウト
 */
export async function logoutAction(): Promise<ActionResult> {
  try {
    const supabase = createClient();

    // ログアウト実行（認証状態に関係なく実行）
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.warn("Logout error (non-critical)", {
        tag: "logoutError",
        error_message: error.message,
      });
      // ログアウトエラーでも成功として扱う（既にログアウト状態の可能性）
      return {
        success: true,
        message: "ログアウトしました",
        redirectUrl: "/login",
      };
    }

    return {
      success: true,
      message: "ログアウトしました",
      redirectUrl: "/login",
    };
  } catch (error) {
    logger.error("Logout action error", {
      tag: "logoutActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });
    await TimingAttackProtection.addConstantDelay();
    // ログアウトは基本的に失敗しない処理として扱う
    return {
      success: true,
      message: "ログアウトしました",
      redirectUrl: "/login",
    };
  }
}
