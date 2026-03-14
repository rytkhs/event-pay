import { redirect } from "next/navigation";

import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { setTestUserById, supabaseAuthMock } from "../../setup/supabase-auth-mock";
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
    const { StatusSyncService } = jest.requireMock(
      "@features/stripe-connect/services/status-sync-service"
    );
    (StatusSyncService as jest.Mock).mockImplementation(() => ({
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
    }));
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

    it("connect account新規作成時にbusinessTypeをデフォルト送信しない", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      __mockStripeConnectService.getConnectAccountByUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          stripe_account_id: "acct_test",
          user_id: defaultUserId,
          status: "unverified",
          charges_enabled: false,
          payouts_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      const { startOnboardingAction } = require("@features/stripe-connect/server");
      await startOnboardingAction();

      expect(__mockStripeConnectService.createExpressAccount).toHaveBeenCalledWith({
        userId: defaultUserId,
        email: "u@example.com",
        country: "JP",
        businessProfile: {
          productDescription:
            "イベントを運営しています。イベントの参加者が参加費を支払う際、イベント管理プラットフォームのみんなの集金を使って参加費が決済されます。",
        },
      });
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

    it("should fall back to cached account status when sync fails", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      const { StatusSyncService } = jest.requireMock(
        "@features/stripe-connect/services/status-sync-service"
      );

      __mockStripeConnectService.getConnectAccountByUser
        .mockResolvedValueOnce({
          stripe_account_id: "acct_test",
          user_id: defaultUserId,
          status: "verified",
          charges_enabled: true,
          payouts_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          stripe_account_id: "acct_test",
          user_id: defaultUserId,
          status: "verified",
          charges_enabled: true,
          payouts_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      (StatusSyncService as jest.Mock).mockImplementation(() => ({
        syncAccountStatus: jest.fn().mockRejectedValue(new Error("sync failed")),
      }));

      const { getConnectAccountStatusAction } = require("@features/stripe-connect/server");
      const result = await getConnectAccountStatusAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasAccount).toBe(true);
        expect(result.data.dbStatus).toBe("verified");
        expect(result.data.uiStatus).toBe("ready");
        expect(result.data.chargesEnabled).toBe(true);
        expect(result.data.payoutsEnabled).toBe(true);
        expect(result.data.requirements).toBeUndefined();
        expect(result.data.capabilities).toBeUndefined();
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

  describe("createExpressDashboardLoginLinkAction", () => {
    it("redirects to login with payments return path when auth lookup fails", async () => {
      supabaseAuthMock.setError(true);

      const { createExpressDashboardLoginLinkAction } = require("@features/stripe-connect/server");
      await createExpressDashboardLoginLinkAction();

      expect(redirect).toHaveBeenCalledWith("/login?redirectTo=/settings/payments");
    });

    it("redirects to login with payments return path when user is missing", async () => {
      supabaseAuthMock.setUser(null);

      const { createExpressDashboardLoginLinkAction } = require("@features/stripe-connect/server");
      await createExpressDashboardLoginLinkAction();

      expect(redirect).toHaveBeenCalledWith("/login?redirectTo=/settings/payments");
    });

    it("redirects back to payments when connect account is missing", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      __mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce(null);

      const { createExpressDashboardLoginLinkAction } = require("@features/stripe-connect/server");
      await createExpressDashboardLoginLinkAction();

      expect(redirect).toHaveBeenCalledWith("/settings/payments");
    });

    it("redirects to payments error page when login link generation fails", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      __mockStripeConnectService.createLoginLink.mockRejectedValueOnce(new Error("boom"));

      const { createExpressDashboardLoginLinkAction } = require("@features/stripe-connect/server");
      await createExpressDashboardLoginLinkAction();

      expect(redirect).toHaveBeenCalledWith(
        "/settings/payments/error?message=Stripe%E3%83%80%E3%83%83%E3%82%B7%E3%83%A5%E3%83%9C%E3%83%BC%E3%83%89%E3%81%B8%E3%81%AE%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E3%81%AB%E5%A4%B1%E6%95%97%E3%81%97%E3%81%BE%E3%81%97%E3%81%9F"
      );
    });

    it("redirects to Stripe when login link is created", async () => {
      const { createExpressDashboardLoginLinkAction } = require("@features/stripe-connect/server");
      await createExpressDashboardLoginLinkAction();

      expect(redirect).toHaveBeenCalledWith("https://connect.stripe.com/express/acct_test/login");
    });
  });
});
