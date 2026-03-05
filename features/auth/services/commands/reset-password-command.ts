import "server-only";

import { TimingAttackProtection } from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { isResetPasswordResult } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { resetPasswordInputSchema } from "@core/validation/auth";

import type { AuthCommandResult, ResetPasswordCommandInput } from "../auth-command-service.types";
import { logAuthError } from "../shared/auth-logging";
import { checkAuthRateLimit } from "../shared/auth-rate-limit";
import { sanitizeEmailOrNull } from "../shared/auth-sanitizer";
import { validationErrorResult } from "../shared/auth-validation-error";

export async function resetPasswordAction(
  input: ResetPasswordCommandInput
): Promise<AuthCommandResult> {
  try {
    const validationResult = resetPasswordInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "有効なメールアドレスを入力してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const sanitizedEmail = sanitizeEmailOrNull(validationResult.data.email);

    if (!sanitizedEmail) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult("有効なメールアドレスを入力してください");
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.passwordReset",
      email: sanitizedEmail,
      ip: input.requestContext.ip,
      blockedMessage:
        "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during password reset",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    const resetResult = await TimingAttackProtection.normalizeResponseTime(
      async () => await supabase.auth.resetPasswordForEmail(sanitizedEmail),
      300
    );

    if (isResetPasswordResult(resetResult) && resetResult.error) {
      logAuthError(resetResult.error, {
        action: "resetPasswordOtpFailed",
        email: sanitizedEmail,
      });
    }

    return okResult(undefined, {
      message: "パスワードリセット用の確認コードを送信しました（登録済みのアドレスの場合）",
      needsVerification: true,
      redirectUrl: `/verify-otp?email=${encodeURIComponent(sanitizedEmail)}&type=recovery`,
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
    return errResult(
      new AppError("RESET_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "処理中にエラーが発生しました",
      })
    );
  }
}
