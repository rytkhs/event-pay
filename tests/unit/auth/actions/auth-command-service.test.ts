import { jest } from "@jest/globals";

import {
  completePasswordResetAction,
  loginAction,
  logoutAction,
  registerAction,
  resendOtpAction,
} from "@features/auth/server";

const mockSupabase = {
  auth: {
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    verifyOtp: jest.fn(),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn(),
    signOut: jest.fn(),
  },
};

const mockEnforceRateLimit = jest.fn();
const mockBuildKey = jest.fn();

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(async () => mockSupabase),
}));

jest.mock("@core/rate-limit/index", () => ({
  buildKey: (...args: unknown[]) => mockBuildKey(...args),
  enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  POLICIES: {
    "auth.login": { scope: "auth.login" },
    "auth.register": { scope: "auth.register" },
    "auth.passwordReset": { scope: "auth.passwordReset" },
    "auth.emailResend": { scope: "auth.emailResend" },
  },
}));

jest.mock("@core/auth-security", () => ({
  ACCOUNT_LOCKOUT_CONFIG: {
    maxFailedAttempts: 10,
    lockoutDurationMs: 30 * 60 * 1000,
  },
  TimingAttackProtection: {
    addConstantDelay: jest.fn(async () => {}),
    normalizeResponseTime: jest.fn(async <T>(fn: () => Promise<T>) => await fn()),
  },
  InputSanitizer: {
    sanitizeEmail: jest.fn((email: string) => email.toLowerCase().trim()),
    sanitizePassword: jest.fn((password: string) => password),
  },
  AccountLockoutService: {
    checkLockoutStatus: jest.fn(async () => ({ isLocked: false, remainingAttempts: 10 })),
    recordFailedAttempt: jest.fn(async () => ({ failedAttempts: 1, isLocked: false })),
    clearFailedAttempts: jest.fn(async () => undefined),
  },
}));

describe("auth-command-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildKey.mockReturnValue("RL:auth:test");
    mockEnforceRateLimit.mockResolvedValue({ allowed: true });

    mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabase.auth.signUp.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabase.auth.verifyOtp.mockResolvedValue({ error: null });
    mockSupabase.auth.resend.mockResolvedValue({ error: null });
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: null });
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user_1" } } });
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
  });

  test("login: email_not_confirmed を検証導線へマップする", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: {
        message: "Email not confirmed",
        name: "AuthApiError",
        status: 400,
        code: "email_not_confirmed",
        __isAuthError: true,
      },
    });

    const result = await loginAction({
      rawData: {
        email: "user@example.com",
        password: "password123",
      },
      requestContext: { ip: "127.0.0.1" },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("LOGIN_FAILED");
    expect(result.error.userMessage).toBe("メールアドレスの確認が必要です。");
    expect(result.meta?.redirectUrl).toBe("/verify-email?email=user%40example.com");
    expect(result.meta?.needsVerification).toBe(true);
  });

  test("register: success時に副作用メタを返す", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "user_signup_1" } },
      error: null,
    });

    const result = await registerAction({
      rawData: {
        name: "Taro",
        email: "taro@example.com",
        password: "password123",
      },
      requestContext: { ip: "127.0.0.1" },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("expected success");
    }

    expect(result.meta?.message).toBe("登録が完了しました。確認メールを送信しました。");
    expect(result.meta?.redirectUrl).toBe("/verify-otp?email=taro%40example.com");
    expect(result.meta?.needsVerification).toBe(true);
    expect(result.meta?.sideEffects?.telemetry).toEqual({
      name: "sign_up",
      method: "password",
      userId: "user_signup_1",
    });
    expect(result.meta?.sideEffects?.accountCreatedSlack).toEqual({
      userName: "Taro",
    });
  });

  test("resend otp: 未サポートtypeは INVALID_REQUEST", async () => {
    const result = await resendOtpAction({
      email: "user@example.com",
      type: "sms",
      requestContext: { ip: "127.0.0.1" },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("INVALID_REQUEST");
    expect(result.error.userMessage).toBe("このタイプの再送信は現在サポートしていません");
  });

  test("complete password reset: セッションなしは TOKEN_EXPIRED", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const result = await completePasswordResetAction({
      rawData: {
        password: "password123",
        passwordConfirm: "password123",
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("TOKEN_EXPIRED");
    expect(result.error.userMessage).toBe(
      "セッションが期限切れです。確認コードを再入力してください"
    );
    expect(result.meta?.redirectUrl).toBe("/verify-otp");
  });

  test("logout: signOutエラーは失敗として返す", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({
      error: {
        message: "network error",
      },
    });

    const result = await logoutAction();

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("LOGOUT_UNEXPECTED_ERROR");
    expect(result.error.userMessage).toBe("ログアウトに失敗しました。再度お試しください。");
    expect(result.meta?.sideEffects?.telemetry).toBeUndefined();
  });
});
