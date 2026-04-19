import { setupRateLimitMocks } from "@tests/setup/common-mocks";
import { expectActionFailure } from "@tests/helpers/assert-result";

import { createGuestStripeSessionAction } from "@features/guest/actions/create-stripe-session";

// モック: ゲストトークン検証は常に有効な参加データを返す
jest.mock("@core/utils/guest-token", () => ({
  __esModule: true,
  validateGuestToken: jest.fn(async () => ({
    isValid: true,
    canModify: true,
    attendance: {
      id: "att_1",
      nickname: "Taro",
      email: "taro@example.com",
      status: "attending",
      guest_token: "gst_12345678901234567890123456789012",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      event: {
        id: "evt_1",
        title: "Test Event",
        description: null,
        date: "2099-01-01T00:00:00.000Z",
        location: null,
        fee: 1200,
        capacity: null,
        registration_deadline: null,
        payment_deadline: "2099-01-01T00:00:00.000Z",
        payment_methods: ["stripe"],
        allow_payment_after_deadline: false,
        grace_period_days: 0,
        community: {
          name: "Test Community",
          legalSlug: "legal-test-community",
        },
        canceled_at: null,
      },
      payment: null,
    },
  })),
}));

// モック: レートリミット（共通関数を使用するため、モック化のみ宣言）
jest.mock("@core/rate-limit", () => {
  const actual = jest.requireActual("@core/rate-limit");
  return {
    ...actual,
    __esModule: true,
    enforceRateLimit: jest.fn(),
    withRateLimit: jest.fn(),
    buildKey: jest.fn(),
    POLICIES: {
      ...actual.POLICIES,
      "payment.createSession": {
        scope: "payment.createSession",
        limit: 3,
        window: "10 s",
        blockMs: 20000,
      },
    },
  };
});

// モック: Connectアカウント取得の結果を制御
let connectAccountResponse: { data: any; error: any } = { data: null, error: null };
let latestPaymentResponse: { data: any; error: any } = { data: null, error: null };

// モック: ゲストクライアントのrpcメソッド
const mockCreateStripeSession = jest.fn().mockResolvedValue({
  sessionUrl: "https://checkout.stripe.com/test",
  sessionId: "cs_test_123",
});

function createRpcResponse(result: { data: any; error: any }) {
  return {
    returns: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue(result),
    }),
  };
}

function createMockGuestClient() {
  return {
    rpc: jest.fn((functionName: string) => {
      if (functionName === "rpc_public_get_connect_account") {
        return createRpcResponse(connectAccountResponse);
      }
      if (functionName === "rpc_guest_get_latest_payment") {
        return createRpcResponse(latestPaymentResponse);
      }
      return createRpcResponse({ data: null, error: null });
    }),
  } as any;
}

// モック: Guest client factory
jest.mock("@core/security/secure-client-factory.impl", () => ({
  __esModule: true,
  createGuestClient: jest.fn(() => createMockGuestClient()),
}));

// モック: Payment port
jest.mock("@core/ports/payments", () => ({
  __esModule: true,
  getPaymentPort: jest.fn(() => ({
    createStripeSession: mockCreateStripeSession,
  })),
}));

describe("createGuestStripeSessionAction - Connectアカウント未設定/無効化", () => {
  const validInput = {
    guestToken: "gst_12345678901234567890123456789012",
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
  };

  beforeAll(() => {
    // 共通モック関数を使用してレート制限を設定
    setupRateLimitMocks(true, "RL:payment.createSession:attendance:att_1");
  });

  beforeEach(() => {
    // 既定は「未設定」
    connectAccountResponse = { data: null, error: null };
    latestPaymentResponse = { data: null, error: null };
    mockCreateStripeSession.mockClear();
  });

  it("Connectアカウント未設定時はCONNECT_ACCOUNT_NOT_FOUNDエラーを返す", async () => {
    connectAccountResponse = { data: null, error: null };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(false);
    const error = expectActionFailure(result);
    expect(error.code).toBe("CONNECT_ACCOUNT_NOT_FOUND");
    expect(error.userMessage).toContain("オンライン決済の準備ができていません");
  });

  it("payouts_enabled=falseでもcollection_ready=trueならセッションを作成する", async () => {
    connectAccountResponse = {
      data: {
        payout_profile_id: "11111111-1111-4111-8111-111111111111",
        stripe_account_id: "acct_1SNbjmCtoNNhKnPZ",
        status: "onboarding",
        collection_ready: true,
        payouts_enabled: false,
      },
      error: null,
    };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionUrl).toBe("https://checkout.stripe.com/test");
      expect(result.data.sessionId).toBe("cs_test_123");
    }
    expect(mockCreateStripeSession).toHaveBeenCalledTimes(1);
  });

  it("collection_ready=falseのときはCONNECT_ACCOUNT_RESTRICTEDエラーを返す", async () => {
    connectAccountResponse = {
      data: {
        payout_profile_id: "11111111-1111-4111-8111-111111111111",
        stripe_account_id: "acct_1SNbjmCtoNNhKnPZ",
        status: "verified",
        collection_ready: false,
        payouts_enabled: true,
      },
      error: null,
    };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(false);
    const error = expectActionFailure(result);
    expect(error.code).toBe("CONNECT_ACCOUNT_RESTRICTED");
  });
});
