import { redirect } from "next/navigation";

import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { setTestUserById } from "../../setup/supabase-auth-mock";
const originalEnv = process.env;
const defaultUserId = "550e8400-e29b-41d4-a716-446655440000";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

// Stripe Connect サービスの依存をモック
jest.mock("@features/stripe-connect/services/factories", () => {
  const __mockStripeConnectService = {
    getConnectAccountByUser: jest.fn().mockResolvedValue({
      stripe_account_id: "acct_test",
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      status: "unverified",
      charges_enabled: false,
      payouts_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    createExpressAccount: jest.fn().mockResolvedValue({
      accountId: "acct_test",
      status: "unverified",
    }),
    createAccountLink: jest.fn().mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    }),
    createLoginLink: jest.fn().mockResolvedValue({
      url: "https://connect.stripe.com/express/acct_test/login",
      created: Math.floor(Date.now() / 1000),
    }),
    updateAccountStatus: jest.fn().mockResolvedValue(undefined),
  };

  return {
    __mockStripeConnectService,
    createUserStripeConnectServiceForServerAction: jest
      .fn()
      .mockResolvedValue(__mockStripeConnectService),
    createUserStripeConnectServiceForServerComponent: jest
      .fn()
      .mockResolvedValue(__mockStripeConnectService),
  };
});

jest.mock("@features/stripe-connect/services/status-sync-service", () => ({
  StatusSyncService: jest.fn().mockImplementation(() => ({
    syncAccountStatus: jest.fn().mockResolvedValue({
      id: "acct_test",
      requirements: {
        currently_due: [],
        eventually_due: [],
        past_due: [],
        pending_verification: [],
      },
      capabilities: {
        card_payments: "inactive",
        transfers: "inactive",
      },
    }),
  })),
}));

// Supabase 認証モック（共通モックを使用）
jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
  createServerComponentSupabaseClient: jest.fn(),
}));

jest.mock("next/cache", () => ({
  unstable_cache: (fn: any) => fn,
  revalidateTag: jest.fn(),
}));

jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => ({
    balance: {
      retrieve: jest.fn().mockResolvedValue({
        available: [{ currency: "jpy", amount: 1000 }],
        pending: [{ currency: "jpy", amount: 500 }],
      }),
    },
    accounts: {
      retrieve: jest.fn().mockResolvedValue({
        id: "acct_test",
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: "inactive",
          transfers: "inactive",
        },
      }),
    },
  })),
  generateIdempotencyKey: jest.fn(() => "test_idempotency_key"),
}));

describe("Stripe Connect actions", () => {
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;

  beforeAll(() => {
    // 共通モックを使用してSupabaseクライアントを設定
    mockSupabase = setupSupabaseClientMocks();
    // テスト用ユーザーを設定
    setTestUserById(defaultUserId, "u@example.com");
    const {
      createServerActionSupabaseClient,
      createServerComponentSupabaseClient,
    } = require("@core/supabase/factory");
    (
      createServerActionSupabaseClient as jest.MockedFunction<
        typeof createServerActionSupabaseClient
      >
    ).mockResolvedValue(mockSupabase as any);
    (
      createServerComponentSupabaseClient as jest.MockedFunction<
        typeof createServerComponentSupabaseClient
      >
    ).mockResolvedValue(mockSupabase as any);
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    };
    setTestUserById(defaultUserId, "u@example.com");
    const { __mockStripeConnectService } = jest.requireMock(
      "@features/stripe-connect/services/factories"
    );
    __mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
      stripe_account_id: "acct_test",
      user_id: defaultUserId,
      status: "unverified",
      charges_enabled: false,
      payouts_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    (redirect as unknown as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("startOnboardingAction", () => {
    it("正常にオンボーディングを開始してリダイレクトする", async () => {
      const { startOnboardingAction } = require("@features/stripe-connect/server");
      await startOnboardingAction();
      expect(redirect).toHaveBeenCalledWith(expect.stringContaining("https://connect.stripe.com"));
    });
  });

  describe("getStripeBalanceAction", () => {
    it("should return cached balance (calculated from available + pending)", async () => {
      const { getStripeBalanceAction } = require("@features/stripe-connect/server");
      // Use a valid UUID to pass validateUserId check in real Service
      const validUserId = "550e8400-e29b-41d4-a716-446655440000";
      setTestUserById(validUserId, "u@example.com");

      // Mock Supabase to return a connect account
      (mockSupabase.from as jest.Mock).mockImplementation((tableName) => {
        if (tableName === "stripe_connect_accounts") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { stripe_account_id: "acct_test_123" },
              error: null,
            }),
          } as any;
        }
        // default fallback
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      const result = await getStripeBalanceAction();
      expect(result.success).toBe(true);
      if (result.success) {
        // 1000 + 500 = 1500
        expect(result.data).toBe(1500);
      }
    });
  });

  describe("getConnectAccountStatusAction", () => {
    it("should return account status when account exists", async () => {
      const { getConnectAccountStatusAction } = require("@features/stripe-connect/server");
      const result = await getConnectAccountStatusAction();

      // Based on mock data in jest.mock above
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasAccount).toBe(true);
        expect(result.data.accountId).toBe("acct_test");
        expect(result.data.dbStatus).toBe("unverified");
      }
    });
  });

  describe("checkExpressDashboardAccessAction", () => {
    it("should return hasAccount: true when account exists", async () => {
      const { checkExpressDashboardAccessAction } = require("@features/stripe-connect/server");
      const result = await checkExpressDashboardAccessAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasAccount).toBe(true);
        expect(result.data.accountId).toBe("acct_test");
      }
    });
  });
});
