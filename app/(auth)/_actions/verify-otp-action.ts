"use server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { verifyOtpInputSchema } from "@core/validation/auth";

function formDataToObject(formData: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value.toString();
  }
  return data;
}

/**
 * OTP検証
 */
export async function verifyOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = verifyOtpInputSchema.safeParse(rawData);

    if (!result.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { email, otp, type } = result.data;
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
