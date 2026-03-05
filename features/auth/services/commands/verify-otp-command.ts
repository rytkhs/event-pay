import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";

import { AppError, errResult, okResult } from "@core/errors";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { verifyOtpInputSchema } from "@core/validation/auth";

import type { AuthCommandResult, VerifyOtpCommandInput } from "../auth-command-service.types";

function validationErrorResult(
  userMessage: string,
  fieldErrors?: Record<string, string[] | undefined>
): AuthCommandResult<never> {
  return errResult(
    new AppError("VALIDATION_ERROR", {
      userMessage,
      details: fieldErrors,
    })
  );
}

function mapVerifyOtpErrorResult(verifiedError: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(verifiedError, "otp_expired")) {
    return errResult(
      new AppError("OTP_EXPIRED", {
        userMessage: "確認コードが無効、もしくは有効期限が切れています",
      })
    );
  }

  if (hasAuthErrorCode(verifiedError, "otp_invalid")) {
    return errResult(
      new AppError("OTP_INVALID", {
        userMessage: "無効な確認コードです",
      })
    );
  }

  return errResult(
    new AppError("OTP_INVALID", {
      userMessage: "確認コードが正しくありません",
    })
  );
}

export async function verifyOtpAction(input: VerifyOtpCommandInput): Promise<AuthCommandResult> {
  try {
    const validationResult = verifyOtpInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { email, otp, type } = validationResult.data;
    const supabase = await createServerActionSupabaseClient();

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

      return mapVerifyOtpErrorResult(verifiedError);
    }

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

    return okResult(undefined, {
      message,
      redirectUrl,
    });
  } catch (error) {
    handleServerError("OTP_UNEXPECTED_ERROR", {
      action: "verifyOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("OTP_UNEXPECTED_ERROR", {
        userMessage: "確認処理中にエラーが発生しました",
      })
    );
  }
}
