import "server-only";

import { AppError, errResult, okResult } from "@core/errors";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { emailCheckSchema } from "@core/validation/auth";

import type { AuthCommandResult, ResendOtpCommandInput } from "../auth-command-service.types";
import { mapResendOtpErrorResult } from "../shared/auth-error-mappers";
import { logAuthError } from "../shared/auth-logging";
import { checkAuthRateLimit } from "../shared/auth-rate-limit";
import { sanitizeEmailOrNull } from "../shared/auth-sanitizer";

export async function resendOtpAction(input: ResendOtpCommandInput): Promise<AuthCommandResult> {
  try {
    const email = input.email;
    const type = input.type ?? "signup";

    if (!email || !emailCheckSchema.safeParse(email).success) {
      return errResult(
        new AppError("VALIDATION_ERROR", {
          userMessage: "有効なメールアドレスを入力してください",
        })
      );
    }

    const sanitizedEmail = sanitizeEmailOrNull(email);
    if (!sanitizedEmail) {
      return errResult(
        new AppError("VALIDATION_ERROR", {
          userMessage: "有効なメールアドレスを入力してください",
        })
      );
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.emailResend",
      email: sanitizedEmail,
      ip: input.requestContext.ip,
      blockedMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during email resend",
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    let resendResult;

    if (type === "recovery") {
      resendResult = await supabase.auth.resetPasswordForEmail(sanitizedEmail);
    } else if (type === "signup" || type === "email_change") {
      resendResult = await supabase.auth.resend({
        type: type as "signup" | "email_change",
        email: sanitizedEmail,
      });
    } else {
      return errResult(
        new AppError("INVALID_REQUEST", {
          userMessage: "このタイプの再送信は現在サポートしていません",
        })
      );
    }

    if (resendResult.error) {
      logAuthError(resendResult.error, {
        action: "resendOtpFailed",
        email: sanitizedEmail,
      });

      return mapResendOtpErrorResult(resendResult.error);
    }

    return okResult(undefined, {
      message: "確認コードを再送信しました",
    });
  } catch (error) {
    handleServerError("RESEND_OTP_UNEXPECTED_ERROR", {
      action: "resendOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("RESEND_OTP_UNEXPECTED_ERROR", {
        userMessage: "再送信中にエラーが発生しました",
      })
    );
  }
}
