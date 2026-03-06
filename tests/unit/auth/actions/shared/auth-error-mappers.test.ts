import { jest } from "@jest/globals";

import {
  mapLoginAuthErrorResult,
  mapRegisterAuthErrorResult,
  mapResendOtpErrorResult,
  mapVerifyOtpErrorResult,
} from "@features/auth/services/shared/auth-error-mappers";

jest.mock("@core/auth-security", () => ({
  ACCOUNT_LOCKOUT_CONFIG: {
    maxFailedAttempts: 10,
  },
}));

describe("auth-error-mappers", () => {
  test("login: email_not_confirmed を needsVerification 付きで返す", () => {
    const result = mapLoginAuthErrorResult({
      signInError: {
        name: "AuthApiError",
        status: 400,
        code: "email_not_confirmed",
        message: "Email not confirmed",
        __isAuthError: true,
      },
      sanitizedEmail: "user@example.com",
      lockoutResult: {
        failedAttempts: 1,
        isLocked: false,
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }
    expect(result.error.code).toBe("LOGIN_FAILED");
    expect(result.meta?.needsVerification).toBe(true);
  });

  test("register: user_already_exists を ALREADY_EXISTS に変換", () => {
    const result = mapRegisterAuthErrorResult({
      name: "AuthApiError",
      status: 400,
      code: "user_already_exists",
      message: "already exists",
      __isAuthError: true,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }
    expect(result.error.code).toBe("ALREADY_EXISTS");
  });

  test("verifyOtp: otp_expired を OTP_EXPIRED に変換", () => {
    const result = mapVerifyOtpErrorResult({
      name: "AuthApiError",
      status: 400,
      code: "otp_expired",
      message: "expired",
      __isAuthError: true,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }
    expect(result.error.code).toBe("OTP_EXPIRED");
  });

  test("resendOtp: over_email_send_limit を RATE_LIMITED に変換", () => {
    const result = mapResendOtpErrorResult({
      name: "AuthApiError",
      status: 429,
      code: "over_email_send_limit",
      message: "too many emails",
      __isAuthError: true,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }
    expect(result.error.code).toBe("RATE_LIMITED");
  });
});
