import {
  mapLoginAuthErrorToFail,
  mapRegisterAuthErrorToFail,
  mapResendOtpErrorToFail,
  mapVerifyOtpErrorToFail,
} from "@/app/(auth)/_actions/_shared/auth-error-mappers";

import { expectActionFailure } from "../../../helpers/assert-result";

describe("auth-error-mappers", () => {
  test("login: email_not_confirmed は検証導線へマップされる", () => {
    const result = mapLoginAuthErrorToFail({
      signInError: {
        message: "Email not confirmed",
        name: "AuthApiError",
        status: 400,
        code: "email_not_confirmed",
        __isAuthError: true,
      },
      sanitizedEmail: "user@example.com",
      lockoutResult: {
        failedAttempts: 1,
        isLocked: false,
      },
    });

    const error = expectActionFailure(result);
    expect(error.code).toBe("LOGIN_FAILED");
    expect(error.userMessage).toBe("メールアドレスの確認が必要です。");
    expect(result.redirectUrl).toBe("/verify-email?email=user%40example.com");
    expect(result.needsVerification).toBe(true);
  });

  test("register: user_already_exists は ALREADY_EXISTS にマップされる", () => {
    const result = mapRegisterAuthErrorToFail({
      message: "User already exists",
      name: "AuthApiError",
      status: 400,
      code: "user_already_exists",
      __isAuthError: true,
    });

    const error = expectActionFailure(result);
    expect(error.code).toBe("ALREADY_EXISTS");
    expect(error.userMessage).toBe("このメールアドレスは既に登録されています");
    expect(error.retryable).toBe(false);
  });

  test("verify otp: otp_expired は OTP_EXPIRED にマップされる", () => {
    const result = mapVerifyOtpErrorToFail({
      message: "Token has expired or is invalid",
      name: "AuthApiError",
      status: 400,
      code: "otp_expired",
      __isAuthError: true,
    });

    const error = expectActionFailure(result);
    expect(error.code).toBe("OTP_EXPIRED");
    expect(error.userMessage).toBe("確認コードが無効、もしくは有効期限が切れています");
  });

  test("resend otp: over_email_send_limit は RATE_LIMITED にマップされる", () => {
    const result = mapResendOtpErrorToFail({
      message: "Rate limit exceeded",
      name: "AuthApiError",
      status: 429,
      code: "over_email_send_limit",
      __isAuthError: true,
    });

    const error = expectActionFailure(result);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.userMessage).toBe(
      "送信回数の上限に達しました。しばらく時間をおいてからお試しください"
    );
    expect(error.retryable).toBe(true);
  });
});
