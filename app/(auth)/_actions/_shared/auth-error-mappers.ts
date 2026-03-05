import { ACCOUNT_LOCKOUT_CONFIG, type LockoutResult } from "@core/auth-security";
import { fail, type ActionResult } from "@core/errors/adapters/server-actions";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";

type RegisterFailureCode = "ALREADY_EXISTS" | "RATE_LIMITED" | "REGISTRATION_UNEXPECTED_ERROR";

type LoginAuthFailureParams = {
  signInError: unknown;
  sanitizedEmail: string;
  lockoutResult: LockoutResult;
};

export function mapLoginAuthErrorToFail({
  signInError,
  sanitizedEmail,
  lockoutResult,
}: LoginAuthFailureParams): ActionResult<never> {
  if (lockoutResult.isLocked) {
    return fail("FORBIDDEN", {
      userMessage: "アカウントがロックされました。しばらく時間をおいてからお試しください。",
    });
  }

  if (hasAuthErrorCode(signInError, "email_not_confirmed")) {
    return fail("LOGIN_FAILED", {
      userMessage: "メールアドレスの確認が必要です。",
      redirectUrl: `/verify-email?email=${encodeURIComponent(sanitizedEmail)}`,
      needsVerification: true,
    });
  }

  let errorMessage = "メールアドレスまたはパスワードが正しくありません";

  if (lockoutResult.failedAttempts >= 3) {
    const remaining = ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts - lockoutResult.failedAttempts;
    errorMessage += ` (残り${remaining}回の試行でアカウントがロックされます)`;
  }

  return fail("LOGIN_FAILED", { userMessage: errorMessage });
}

export function mapRegisterAuthErrorToFail(signUpError: unknown): ActionResult<never> {
  let errorMessage = "登録処理中にエラーが発生しました";
  let errorCode: RegisterFailureCode = "REGISTRATION_UNEXPECTED_ERROR";

  if (hasAuthErrorCode(signUpError, "user_already_exists")) {
    errorMessage = "このメールアドレスは既に登録されています";
    errorCode = "ALREADY_EXISTS";
  } else if (hasAuthErrorCode(signUpError, "over_email_send_limit")) {
    errorMessage = "送信回数の上限に達しました。しばらく時間をおいてからお試しください";
    errorCode = "RATE_LIMITED";
  }

  return fail(errorCode, {
    userMessage: errorMessage,
    retryable: errorCode === "RATE_LIMITED",
  });
}

export function mapVerifyOtpErrorToFail(verifiedError: unknown): ActionResult<never> {
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

export function mapResendOtpErrorToFail(error: unknown): ActionResult<never> {
  if (hasAuthErrorCode(error, "over_email_send_limit")) {
    return fail("RATE_LIMITED", {
      userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
      retryable: true,
    });
  }

  return fail("RESEND_OTP_UNEXPECTED_ERROR", {
    userMessage: "再送信中にエラーが発生しました",
  });
}
