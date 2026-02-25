const mockResendSend = jest.fn();
const mockResendCtor = jest.fn();
const mockServiceLoggerInfo = jest.fn();
const mockServiceLoggerWarn = jest.fn();
const mockServiceLoggerError = jest.fn();
const mockRootLoggerWarn = jest.fn();
const mockHandleServerError = jest.fn();
const mockGetEnv = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation((apiKey: string) => {
    mockResendCtor(apiKey);
    return {
      emails: {
        send: mockResendSend,
      },
    };
  }),
}));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    warn: mockRootLoggerWarn,
    withContext: jest.fn(() => ({
      info: mockServiceLoggerInfo,
      warn: mockServiceLoggerWarn,
      error: mockServiceLoggerError,
    })),
  },
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: mockHandleServerError,
}));

jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: mockGetEnv,
}));

const originalNodeEnv = process.env.NODE_ENV;

const defaultEnv = {
  RESEND_API_KEY: "re_test_123",
  FROM_EMAIL: "noreply@example.com",
  FROM_NAME: "EventPay",
  ADMIN_EMAIL: "admin@example.com",
  NODE_ENV: "production",
};

function createService() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EmailNotificationService } = require("@core/notification/email-service");
  return new EmailNotificationService();
}

describe("core/notification/email-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useRealTimers();
    // Jitter（ゆらぎ）を無効化するために Math.random を固定 (0.5 * 2 - 1 = 0)
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    process.env.NODE_ENV = "production";
    mockGetEnv.mockReturnValue({ ...defaultEnv });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("sendEmail は指定された idempotencyKey を Resend SDK に渡す", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "email_1" },
      error: null,
    });

    const service = createService();
    const result = await service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "hello",
        html: "<p>hello</p>",
        text: "hello",
      },
      idempotencyKey: "custom-idempotency-key",
    });

    expect(result.success).toBe(true);
    expect(mockResendCtor).toHaveBeenCalledWith("re_test_123");
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["user@example.com"],
      }),
      expect.objectContaining({
        idempotencyKey: "custom-idempotency-key",
      })
    );
  });

  it("sendEmail は idempotencyKey 未指定時に自動生成して渡す", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "email_2" },
      error: null,
    });

    const service = createService();
    const result = await service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "hello",
        html: "<p>hello</p>",
        text: "hello",
      },
    });

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
      })
    );
  });

  it("rate_limit_exceeded は RATE_LIMIT_RETRY_DELAY_MS (5000ms) で再試行する", async () => {
    jest.useFakeTimers();
    mockResendSend
      .mockResolvedValueOnce({
        data: null,
        error: {
          name: "rate_limit_exceeded",
          message: "Too many requests",
        },
      })
      .mockResolvedValueOnce({
        data: { id: "email_retry_ok" },
        error: null,
      });

    const service = createService();
    const sending = service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "rate-limit",
        html: "<p>rate-limit</p>",
        text: "rate-limit",
      },
      idempotencyKey: "rate-limit-case",
    });

    await Promise.resolve();
    expect(mockResendSend).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5000);
    const result = await sending;

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledTimes(2);
    expect(mockServiceLoggerInfo).toHaveBeenCalledWith(
      "Retrying email send after delay",
      expect.objectContaining({
        delay_ms: 5000,
      })
    );
  });

  it("monthly_quota_exceeded は恒久エラーとして即時終了する", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        name: "monthly_quota_exceeded",
        message: "Monthly quota exceeded",
      },
    });

    const service = createService();
    const result = await service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "quota",
        html: "<p>quota</p>",
        text: "quota",
      },
      idempotencyKey: "quota-case",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.meta?.errorType).toBe("permanent");
      expect(result.meta?.retryCount).toBe(0);
    }
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("409 concurrent_idempotent_requests は再試行する", async () => {
    jest.useFakeTimers();
    mockResendSend
      .mockResolvedValueOnce({
        data: null,
        error: {
          name: "concurrent_idempotent_requests",
          message: "Request still in progress",
        },
      })
      .mockResolvedValueOnce({
        data: { id: "email_409_retry_ok" },
        error: null,
      });

    const service = createService();
    const sending = service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "409 retry",
        html: "<p>409 retry</p>",
        text: "409 retry",
      },
      idempotencyKey: "409-concurrent",
    });

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    const result = await sending;

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledTimes(2);
  });

  it("409 invalid_idempotent_request は恒久エラーとして即時終了する", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        name: "invalid_idempotent_request",
        message: "Payload mismatch",
      },
    });

    const service = createService();
    const result = await service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "409 permanent",
        html: "<p>409 permanent</p>",
        text: "409 permanent",
      },
      idempotencyKey: "409-invalid",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.meta?.errorType).toBe("permanent");
      expect(result.meta?.retryCount).toBe(0);
    }
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("daily_quota_exceeded は恒久エラーとして即時終了する", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        name: "daily_quota_exceeded",
        message: "Daily quota exceeded",
      },
    });

    const service = createService();
    const result = await service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "daily quota",
        html: "<p>daily quota</p>",
        text: "daily quota",
      },
      idempotencyKey: "daily-quota-case",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.meta?.errorType).toBe("permanent");
    }
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("application_error (500) は一時的エラーとして再試行する", async () => {
    jest.useFakeTimers();
    mockResendSend
      .mockResolvedValueOnce({
        data: null,
        error: {
          name: "application_error",
          message: "Internal server error",
        },
      })
      .mockResolvedValueOnce({
        data: { id: "email_500_retry_ok" },
        error: null,
      });

    const service = createService();
    const sending = service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "500 retry",
        html: "<p>500 retry</p>",
        text: "500 retry",
      },
      idempotencyKey: "500-retry",
    });

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    const result = await sending;

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledTimes(2);
  });

  it("validation_error (403) は恒久エラーとして即時終了する", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "Domain not verified",
      },
    });

    const service = createService();
    const result = await service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "validation",
        html: "<p>validation</p>",
        text: "validation",
      },
      idempotencyKey: "validation-case",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.meta?.errorType).toBe("permanent");
    }
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("ネイティブ Error の timeout はネットワークエラーとして分類される", async () => {
    jest.useFakeTimers();
    mockResendSend.mockRejectedValue(new Error("socket timeout"));

    const service = createService();
    const sending = service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "network timeout",
        html: "<p>network timeout</p>",
        text: "network timeout",
      },
      idempotencyKey: "native-error-timeout",
    });

    await Promise.resolve();
    // INITIAL_RETRY_DELAY_MS (1000ms) 以上進める
    await jest.advanceTimersByTimeAsync(1500);
    const result = await sending;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("ネットワークエラー");
      expect(result.meta?.errorType).toBe("transient");
      expect(result.meta?.retryCount).toBe(1);
    }
    expect(mockResendSend).toHaveBeenCalledTimes(2);
  });

  it("sendAdminAlert は idempotencyKey を sendEmail 経由で引き継ぐ", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "admin_alert_1" },
      error: null,
    });

    const service = createService();
    const result = await service.sendAdminAlert({
      subject: "Alert",
      message: "Message",
      details: { foo: "bar" },
      idempotencyKey: "admin-alert-key",
    });

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: "admin-alert-key",
      })
    );
  });
});
