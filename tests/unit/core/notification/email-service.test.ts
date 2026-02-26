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
    process.env.NODE_ENV = "production";
    mockGetEnv.mockReturnValue({ ...defaultEnv });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("sendEmail は指定された idempotencyKey を Resend SDK に渡す", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "email_1" },
      error: null,
      headers: {},
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
      headers: {},
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

  it("429 + retry-after ヘッダーがある場合は retry-after 秒で再試行する", async () => {
    jest.useFakeTimers();
    mockResendSend
      .mockResolvedValueOnce({
        data: null,
        error: {
          name: "rate_limit_exceeded",
          statusCode: 429,
          message: "Too many requests",
        },
        headers: { "retry-after": "7" },
      })
      .mockResolvedValueOnce({
        data: { id: "email_retry_after_ok" },
        error: null,
        headers: {},
      });

    const service = createService();
    const sending = service.sendEmail({
      to: "user@example.com",
      template: {
        subject: "retry-after",
        html: "<p>retry-after</p>",
        text: "retry-after",
      },
      idempotencyKey: "retry-after-case",
    });

    await Promise.resolve();
    expect(mockResendSend).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(7000);
    const result = await sending;

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledTimes(2);
    expect(mockServiceLoggerInfo).toHaveBeenCalledWith(
      "Retrying email send after delay",
      expect.objectContaining({
        delay_ms: 7000,
        retry_after_seconds: 7,
      })
    );
  });

  it("429 monthly_quota_exceeded は恒久エラーとして即時終了する", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        name: "monthly_quota_exceeded",
        statusCode: 429,
        message: "Monthly quota exceeded",
      },
      headers: { "retry-after": "120" },
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
      expect(result.meta?.retryAfterSeconds).toBe(120);
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
          statusCode: 409,
          message: "Request still in progress",
        },
        headers: {},
      })
      .mockResolvedValueOnce({
        data: { id: "email_409_retry_ok" },
        error: null,
        headers: {},
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
        statusCode: 409,
        message: "Payload mismatch",
      },
      headers: {},
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
      expect(result.meta?.statusCode).toBe(409);
    }
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("sendAdminAlert は idempotencyKey を sendEmail 経由で引き継ぐ", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "admin_alert_1" },
      error: null,
      headers: {},
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
