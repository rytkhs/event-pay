"use server";

import { TimingAttackProtection, InputSanitizer } from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { isResetPasswordResult } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { resetPasswordInputSchema } from "@core/validation/auth";

import { checkAuthRateLimit } from "./_shared/auth-rate-limit";
import { formDataToObject } from "./_shared/form-data";

/**
 * パスワードリセット要求
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = resetPasswordInputSchema.safeParse(rawData);

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
    const rateLimitCheck = await checkAuthRateLimit({
      scope: "auth.passwordReset",
      email,
      blockedMessage:
        "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during password reset",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck.result;
    }
    const supabase = await createServerActionSupabaseClient();

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
