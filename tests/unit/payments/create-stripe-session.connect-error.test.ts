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
        status: "upcoming",
        created_by: "user_1",
      },
      payment: null,
    },
  })),
}));

// モック: レートリミットは常に許可
jest.mock("@core/rate-limit", () => ({
  __esModule: true,
  createRateLimitStore: jest.fn(async () => ({})),
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
}));

// モック: 管理者Supabaseクライアント（payments と stripe_connect_accounts へのクエリを最小限で再現）
type MaybeSingleResult = { data: any; error: any };

let connectAccountResponse: MaybeSingleResult = { data: null, error: null };

function createMockAdminClient() {
  const makeBuilder = (table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        if (table === "payments") {
          return { data: null, error: null };
        }
        if (table === "stripe_connect_accounts") {
          return connectAccountResponse;
        }
        return { data: null, error: null };
      },
    };
    return builder;
  };

  return {
    from: (table: string) => makeBuilder(table),
  } as any;
}

jest.mock("@core/security/secure-client-factory.impl", () => ({
  __esModule: true,
  SecureSupabaseClientFactory: {
    getInstance: jest.fn(() => ({
      createAuditedAdminClient: jest.fn(async () => createMockAdminClient()),
    })),
  },
}));

describe("createGuestStripeSessionAction - Connectアカウント未設定/無効化", () => {
  const validInput = {
    guestToken: "gst_12345678901234567890123456789012",
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
  };

  beforeEach(() => {
    // 既定は「未設定」
    connectAccountResponse = { data: null, error: null };
  });

  it("Connectアカウント未設定時はRESOURCE_CONFLICTエラーを返す", async () => {
    connectAccountResponse = { data: null, error: null };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(false);
    // @ts-expect-error jest 実行時の型は緩く扱う
    expect(result.code).toBe("RESOURCE_CONFLICT");
    // @ts-expect-error 同上
    expect(result.error).toContain("Stripe Connectアカウントが設定されていません");
  });

  it("payouts_enabled=false時はRESOURCE_CONFLICTエラーを返す", async () => {
    connectAccountResponse = {
      data: { stripe_account_id: "acct_123", payouts_enabled: false },
      error: null,
    };

    const result = await createGuestStripeSessionAction(validInput as any);

    expect(result.success).toBe(false);
    // @ts-expect-error jest 実行時の型は緩く扱う
    expect(result.code).toBe("RESOURCE_CONFLICT");
    // @ts-expect-error 同上
    expect(result.error).toContain("入金機能 (payouts) が無効化されています");
  });
});
