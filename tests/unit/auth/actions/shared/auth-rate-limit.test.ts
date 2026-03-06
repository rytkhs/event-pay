import { jest } from "@jest/globals";

import { checkAuthRateLimit } from "@features/auth/services/shared/auth-rate-limit";

const mockBuildKey = jest.fn();
const mockEnforceRateLimit = jest.fn();
const mockLoggerWarn = jest.fn();

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

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

describe("auth-rate-limit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildKey.mockReturnValue("RL:auth:test");
    mockEnforceRateLimit.mockResolvedValue({ allowed: true });
  });

  test("allowedの場合はnullを返す", async () => {
    const result = await checkAuthRateLimit({
      scope: "auth.login",
      email: "user@example.com",
      blockedMessage: "blocked",
      failureLogMessage: "rate limit failed",
    });

    expect(result).toBeNull();
  });

  test("blockedの場合はRATE_LIMITEDを返しdelay callbackを呼ぶ", async () => {
    const onBlockedDelay = jest.fn(async () => {});
    mockEnforceRateLimit.mockResolvedValue({ allowed: false });

    const result = await checkAuthRateLimit({
      scope: "auth.register",
      email: "user@example.com",
      blockedMessage: "blocked",
      failureLogMessage: "rate limit failed",
      withConstantDelay: onBlockedDelay,
    });

    expect(onBlockedDelay).toHaveBeenCalledTimes(1);
    expect(result?.success).toBe(false);
    if (result?.success !== false) {
      throw new Error("expected failure result");
    }
    expect(result.error.code).toBe("RATE_LIMITED");
  });

  test("rate limit基盤エラー時はfail-openでnullを返しログに方針を残す", async () => {
    mockEnforceRateLimit.mockRejectedValue(new Error("redis down"));

    const result = await checkAuthRateLimit({
      scope: "auth.passwordReset",
      email: "user@example.com",
      blockedMessage: "blocked",
      failureLogMessage: "rate limit failed",
    });

    expect(result).toBeNull();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "rate limit failed",
      expect.objectContaining({
        action: "rateLimitCheckFailed",
        category: "security",
        rate_limit_policy: "fail-open",
      })
    );
  });
});
