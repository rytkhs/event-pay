import {
  computeRetryDelayMs,
  DEFAULT_MAX_ATTEMPTS,
  INITIAL_RETRY_DELAY_MS,
  RATE_LIMIT_RETRY_DELAY_MS,
  shouldRetry,
} from "@core/notification/email-retry-policy";

describe("core/notification/email-retry-policy", () => {
  it("transient error は最大回数まで再試行する", () => {
    const result = shouldRetry({
      errorInfo: { type: "transient", message: "temporary" },
      attempt: 1,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });

    expect(result).toBe(true);
  });

  it("最大回数到達時は再試行しない", () => {
    const result = shouldRetry({
      errorInfo: { type: "transient", message: "temporary" },
      attempt: DEFAULT_MAX_ATTEMPTS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });

    expect(result).toBe(false);
  });

  it("permanent error は再試行しない", () => {
    const result = shouldRetry({
      errorInfo: { type: "permanent", message: "permanent" },
      attempt: 1,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });

    expect(result).toBe(false);
  });

  it("rate_limit_exceeded は 5000ms 遅延になる", () => {
    const delay = computeRetryDelayMs({
      attempt: 0,
      errorName: "rate_limit_exceeded",
      randomFn: () => 0.5,
    });

    expect(delay).toBe(RATE_LIMIT_RETRY_DELAY_MS);
  });

  it("429 かつ retry-after がある場合は retry-after を優先する", () => {
    const delay = computeRetryDelayMs({
      attempt: 0,
      statusCode: 429,
      errorName: "rate_limit_exceeded",
      retryAfterSeconds: 2,
      randomFn: () => 1,
    });

    expect(delay).toBe(2000);
  });

  it("通常リトライは指数バックオフになる", () => {
    const delay = computeRetryDelayMs({
      attempt: 2,
      randomFn: () => 0.5,
    });

    expect(delay).toBe(INITIAL_RETRY_DELAY_MS * 4);
  });

  it("jitter が遅延に反映される", () => {
    const delay = computeRetryDelayMs({
      attempt: 0,
      randomFn: () => 1,
    });

    expect(delay).toBe(1200);
  });
});
