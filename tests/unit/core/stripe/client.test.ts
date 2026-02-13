import type Stripe from "stripe";

const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockHandleServerError = jest.fn();
const mockGetEnv = jest.fn();

type MockStripeHandler = (payload: Stripe.RequestEvent | Stripe.ResponseEvent) => void;
type MockStripeInstance = {
  apiKey: string;
  options: Record<string, unknown>;
  handlers: Record<string, MockStripeHandler>;
};

const stripeInstances: MockStripeInstance[] = [];
const stripeCtorMock = jest.fn();
const createFetchHttpClientMock = jest.fn(() => ({ kind: "fetch-http-client" }));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: mockGetEnv,
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: mockHandleServerError,
}));

jest.mock("stripe", () => {
  class MockStripe {
    static createFetchHttpClient = createFetchHttpClientMock;
    readonly apiKey: string;
    readonly options: Record<string, unknown>;
    readonly handlers: Record<string, MockStripeHandler> = {};

    constructor(apiKey: string, options: Record<string, unknown>) {
      this.apiKey = apiKey;
      this.options = options;
      stripeCtorMock(apiKey, options);
      stripeInstances.push(this);
    }

    on(event: "request" | "response", cb: MockStripeHandler) {
      this.handlers[event] = cb;
    }
  }

  return {
    __esModule: true,
    default: MockStripe,
  };
});

const defaultEnv = {
  STRIPE_SECRET_KEY: "sk_test_super_secret_key_value",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_publishable",
  STRIPE_LOG_VERBOSE: "false",
  NODE_ENV: "development",
};

describe("core/stripe/client", () => {
  beforeEach(() => {
    jest.resetModules();
    stripeInstances.length = 0;
    stripeCtorMock.mockClear();
    createFetchHttpClientMock.mockClear();
    mockLoggerInfo.mockClear();
    mockLoggerWarn.mockClear();
    mockHandleServerError.mockClear();
    mockGetEnv.mockReset();
    mockGetEnv.mockReturnValue({ ...defaultEnv });
  });

  it("getStripe は singleton インスタンスを返し、明示固定 apiVersion を使う", () => {
    const { getStripe } = require("@core/stripe/client") as typeof import("@core/stripe/client");

    const first = getStripe();
    const second = getStripe();

    expect(first).toBe(second);
    expect(stripeCtorMock).toHaveBeenCalledTimes(1);
    expect(stripeCtorMock).toHaveBeenCalledWith(
      "sk_test_super_secret_key_value",
      expect.objectContaining({
        apiVersion: "2025-10-29.clover",
        maxNetworkRetries: 3,
        timeout: 30000,
      })
    );
    expect(createFetchHttpClientMock).toHaveBeenCalledTimes(1);
  });

  it("Stripe API Key debug log にキー断片を含めない", () => {
    const { getStripe } = require("@core/stripe/client") as typeof import("@core/stripe/client");

    getStripe();

    const debugCall = mockLoggerInfo.mock.calls.find(
      ([message]) => message === "Stripe API Key Debug Info"
    );
    expect(debugCall).toBeDefined();
    const debugFields = debugCall?.[1] as Record<string, unknown>;
    expect(debugFields).toHaveProperty("key_length");
    expect(debugFields).not.toHaveProperty("key_starts_with");
    expect(debugFields).not.toHaveProperty("key_ends_with");
  });

  it("request/response イベントのフィールドを正しいキーでログする", () => {
    const { getStripe } = require("@core/stripe/client") as typeof import("@core/stripe/client");

    getStripe();
    const instance = stripeInstances[0];
    expect(instance).toBeDefined();

    instance.handlers.request({
      api_version: "2025-10-29.clover",
      account: "acct_123",
      idempotency_key: "idem_123",
      method: "POST",
      path: "/v1/charges",
      request_start_time: Date.now(),
    });

    instance.handlers.response({
      api_version: "2025-10-29.clover",
      account: "acct_123",
      idempotency_key: "idem_123",
      method: "POST",
      path: "/v1/charges",
      status: 402,
      request_id: "req_123",
      elapsed: 120,
      request_start_time: Date.now() - 120,
      request_end_time: Date.now(),
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Stripe request initiated",
      expect.objectContaining({
        idempotency_key: "idem_123",
        method: "POST",
        path: "/v1/charges",
        stripe_account: "acct_123",
      })
    );

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Stripe response received",
      expect.objectContaining({
        stripe_request_id: "req_123",
        status_code: 402,
        latency_ms: 120,
        outcome: "failure",
      })
    );
  });

  it("generateIdempotencyKey は randomUUID を使って prefix を付与できる", () => {
    const { generateIdempotencyKey } =
      require("@core/stripe/client") as typeof import("@core/stripe/client");
    const randomUuidSpy = jest
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("uuid-fixed-value");

    expect(generateIdempotencyKey()).toBe("uuid-fixed-value");
    expect(generateIdempotencyKey("checkout")).toBe("checkout_uuid-fixed-value");

    randomUuidSpy.mockRestore();
  });

  it("generateIdempotencyKey は randomUUID が使えない場合に例外を投げる", () => {
    const { generateIdempotencyKey } =
      require("@core/stripe/client") as typeof import("@core/stripe/client");
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
    });

    expect(() => generateIdempotencyKey()).toThrow(
      "crypto.randomUUID is unavailable: cannot generate a secure idempotency key"
    );

    if (originalDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalDescriptor);
    }
  });
});
