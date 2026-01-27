import { setupRateLimitMocks } from "@tests/setup/common-mocks";

import { createGuestStripeSessionAction } from "@/app/guest/[token]/actions";

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
        status: "upcoming",
        created_by: "user_1",
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
function createMockGuestClient() {
  return {
    rpc: jest.fn((functionName: string) => {
      if (functionName === "rpc_public_get_connect_account") {
        return {
          single: jest.fn().mockResolvedValue(connectAccountResponse),
        };
      }
      if (functionName === "rpc_guest_get_latest_payment") {
        return {
          single: jest.fn().mockResolvedValue(latestPaymentResponse),
        };
      }
      return {
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  } as any;
}

// モック: SecureSupabaseClientFactory
jest.mock("@core/security/secure-client-factory.impl", () => ({
  __esModule: true,
  SecureSupabaseClientFactory: {
    create: jest.fn(() => ({
      createGuestClient: jest.fn(() => createMockGuestClient()),
    })),
  },
}));

// モック: PaymentService
jest.mock("@core/services", () => ({
  __esModule: true,
  getPaymentService: jest.fn(() => ({
    createStripeSession: jest.fn().mockResolvedValue({
      sessionUrl: "https://checkout.stripe.com/test",
      sessionId: "cs_test_123",
    }),
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
  });

  it("Connectアカウント未設定時はRESOURCE_CONFLICTエラーを返す", async () => {
    connectAccountResponse = { data: null, error: null };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RESOURCE_CONFLICT");
    expect(result.error).toContain("決済の準備ができません");
  });

  it("payouts_enabled=false時はRESOURCE_CONFLICTエラーを返す", async () => {
    connectAccountResponse = {
      data: { stripe_account_id: "acct_1SNbjmCtoNNhKnPZ", payouts_enabled: false },
      error: null,
    };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RESOURCE_CONFLICT");
    expect(result.error).toContain("主催者のお支払い受付が一時的に制限されています");
  });
});
