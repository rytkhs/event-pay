"use server";

import { cookies, headers } from "next/headers";

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
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit/index";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { formatUtcToJst } from "@core/utils/timezone";
import { loginInputSchema } from "@core/validation/auth";

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
      const headersList = await headers();
      const ip = getClientIPFromHeaders(headersList) ?? undefined;
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
    const supabase = await createServerActionSupabaseClient();

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
