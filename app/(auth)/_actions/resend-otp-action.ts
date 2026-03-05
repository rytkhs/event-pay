"use server";

import { InputSanitizer } from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { emailCheckSchema } from "@core/validation/auth";

import { mapResendOtpErrorToFail } from "./_shared/auth-error-mappers";
import { checkAuthRateLimit } from "./_shared/auth-rate-limit";

/**
 * OTP再送信
 */
export async function resendOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const email = formData.get("email")?.toString();
    const type = formData.get("type")?.toString() || "signup";

    if (!email || !emailCheckSchema.safeParse(email).success) {
      return fail("VALIDATION_ERROR", { userMessage: "有効なメールアドレスを入力してください" });
    }

    // レート制限チェック（ip + emailHash の AND）
    const rateLimitCheck = await checkAuthRateLimit({
      scope: "auth.emailResend",
      email,
      blockedMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during email resend",
      normalizeEmail: InputSanitizer.sanitizeEmail,
    });
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck.result;
    }

    const supabase = await createServerActionSupabaseClient();

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

      return mapResendOtpErrorToFail(error);
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
