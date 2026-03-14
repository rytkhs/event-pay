import { ACCOUNT_LOCKOUT_CONFIG, type LockoutResult } from "@core/auth-security";
import { AppError, errResult } from "@core/errors";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";

import type { AuthCommandResult } from "../auth-command-service.types";

export function mapLoginAuthErrorResult(params: {
  signInError: unknown;
  sanitizedEmail: string;
  lockoutResult: LockoutResult;
}): AuthCommandResult<never> {
  if (params.lockoutResult.isLocked) {
    return errResult(
      new AppError("FORBIDDEN", {
        userMessage: "アカウントがロックされました。しばらく時間をおいてからお試しください。",
      })
    );
  }

  if (hasAuthErrorCode(params.signInError, "email_not_confirmed")) {
    return errResult(
      new AppError("LOGIN_FAILED", {
        userMessage: "メールアドレスの確認が必要です。",
      }),
      {
        redirectUrl: `/verify-email?email=${encodeURIComponent(params.sanitizedEmail)}`,
        needsVerification: true,
      }
    );
  }

  let errorMessage = "メールアドレスまたはパスワードが正しくありません";

  const remaining =
    ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts - params.lockoutResult.failedAttempts;
  const lockoutDuration = ACCOUNT_LOCKOUT_CONFIG.lockoutDurationMs / 1000 / 60;

  if (remaining <= 3 && remaining > 0) {
    errorMessage += ` (残り${remaining}回の試行でアカウントが${lockoutDuration}分間ロックされます)`;
  }

  return errResult(
    new AppError("LOGIN_FAILED", {
      userMessage: errorMessage,
    })
  );
}

export function mapRegisterAuthErrorResult(signUpError: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(signUpError, "user_already_exists")) {
    return errResult(
      new AppError("ALREADY_EXISTS", {
        userMessage: "このメールアドレスは既に登録されています",
      })
    );
  }

  if (hasAuthErrorCode(signUpError, "over_email_send_limit")) {
    return errResult(
      new AppError("RATE_LIMITED", {
        userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        retryable: true,
      })
    );
  }

  return errResult(
    new AppError("REGISTRATION_UNEXPECTED_ERROR", {
      userMessage: "登録処理中にエラーが発生しました",
    })
  );
}

export function mapVerifyOtpErrorResult(verifiedError: unknown): AuthCommandResult<never> {
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

export function mapResendOtpErrorResult(error: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(error, "over_email_send_limit")) {
    return errResult(
      new AppError("RATE_LIMITED", {
        userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        retryable: true,
      })
    );
  }

  return errResult(
    new AppError("RESEND_OTP_UNEXPECTED_ERROR", {
      userMessage: "再送信中にエラーが発生しました",
    })
  );
}
