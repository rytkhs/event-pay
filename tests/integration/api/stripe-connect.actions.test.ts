//

import { redirect } from "next/navigation";

import { startOnboardingAction, getStripeBalanceAction } from "@features/stripe-connect/server";

import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { createMockSupabaseClient, setTestUserById } from "../../setup/supabase-auth-mock";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

// Stripe Connect サービスのモック（共通モックを使用）
jest.mock("@features/stripe-connect/services", () => {
  const { setupStripeConnectServiceMock } = jest.requireActual<
    typeof import("../../setup/stripe-connect-mock")
  >("../../setup/stripe-connect-mock");

  return setupStripeConnectServiceMock({
    getConnectAccountByUser: {
      stripe_account_id: "acct_test",
      user_id: "user_test",
      status: "unverified",
      charges_enabled: false,
      payouts_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    createExpressAccount: {
      accountId: "acct_test",
      status: "unverified",
    },
    createAccountLink: {
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    },
  });
});

// Supabase 認証モック（共通モックを使用）
jest.mock("@core/supabase/server", () => ({
  createClient: jest.fn(),
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

jest.mock("@core/utils/cloudflare-env", () => {
  const defaultEnv = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    ALLOWED_ORIGINS: undefined,
    FORCE_SECURE_COOKIES: "false",
    NODE_ENV: "test",
    COOKIE_DOMAIN: undefined,
  } as const;

  return {
    getEnv: jest.fn(() => ({ ...defaultEnv })),
  };
});

describe("Stripe Connect actions", () => {
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;
  let getEnvMock: jest.Mock;

  beforeAll(() => {
    // 共通モックを使用してSupabaseクライアントを設定
    mockSupabase = setupSupabaseClientMocks();
    // テスト用ユーザーを設定
    setTestUserById("user_test", "u@example.com");
    const { createClient } = require("@core/supabase/server");
    (createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any);

    const { getEnv } = require("@core/utils/cloudflare-env");
    getEnvMock = getEnv as jest.Mock;
  });

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    setTestUserById("user_test", "u@example.com");
    getEnvMock.mockReturnValue({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      ALLOWED_ORIGINS: undefined,
      FORCE_SECURE_COOKIES: "false",
      NODE_ENV: process.env.NODE_ENV,
      COOKIE_DOMAIN: undefined,
    });
    (redirect as unknown as jest.Mock).mockClear();
  });

  describe("startOnboardingAction", () => {
    it("正常にオンボーディングを開始してリダイレクトする", async () => {
      await startOnboardingAction();
      expect(redirect).toHaveBeenCalledWith(expect.stringContaining("https://connect.stripe.com"));
    });
  });

  describe("getStripeBalanceAction", () => {
    it("should return cached balance (calculated from available + pending)", async () => {
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
