"use server";

import {
  AccountLockoutService,
  TimingAttackProtection,
  InputSanitizer,
  type LockoutStatus,
} from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { formatUtcToJst } from "@core/utils/timezone";
import { loginInputSchema } from "@core/validation/auth";

import { mapLoginAuthErrorToFail } from "./_shared/auth-error-mappers";
import { checkAuthRateLimit } from "./_shared/auth-rate-limit";
import { trackAuthEvent } from "./_shared/auth-telemetry";
import { formDataToObject } from "./_shared/form-data";

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
    const rateLimitCheck = await checkAuthRateLimit({
      scope: "auth.login",
      email: sanitizedEmail,
      blockedMessage: "ログイン試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck.result;
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

      const lockoutResult = await AccountLockoutService.recordFailedAttempt(sanitizedEmail);
      return mapLoginAuthErrorToFail({ signInError, sanitizedEmail, lockoutResult });
    }

    // ログイン成功: 失敗回数とロックをクリア
    await AccountLockoutService.clearFailedAttempts(sanitizedEmail);

    trackAuthEvent({
      name: "login",
      method: "password",
      userId: signInData?.user?.id,
    });

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
