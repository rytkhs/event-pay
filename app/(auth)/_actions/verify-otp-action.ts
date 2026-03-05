"use server";

import type { EmailOtpType } from "@supabase/supabase-js";

import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { verifyOtpInputSchema } from "@core/validation/auth";

import { mapVerifyOtpErrorToFail } from "./_shared/auth-error-mappers";
import { formDataToObject } from "./_shared/form-data";

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

      return mapVerifyOtpErrorToFail(verifiedError);
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
