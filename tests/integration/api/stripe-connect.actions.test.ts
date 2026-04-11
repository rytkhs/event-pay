import { redirect } from "next/navigation";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";

import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { setTestUserById, supabaseAuthMock } from "../../setup/supabase-auth-mock";

const originalEnv = process.env;
const defaultUserId = "550e8400-e29b-41d4-a716-446655440000";
const representativeCommunityId = "11111111-1111-4111-8111-111111111111";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@core/logging/app-logger", () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn(),
  };
  mockLogger.withContext.mockReturnValue(mockLogger);
  return { logger: mockLogger };
});

const mockResolveCurrentCommunityForServerAction = jest.fn();
const mockResolveCurrentCommunityForServerComponent = jest.fn();
const mockResolveAppWorkspaceForServerComponent = jest.fn();
const mockResolveRepresentativeCommunitySelection = jest.fn();
const mockUpdateRepresentativeCommunitySelection = jest.fn();

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerAction: mockResolveCurrentCommunityForServerAction,
  resolveCurrentCommunityForServerComponent: mockResolveCurrentCommunityForServerComponent,
}));

jest.mock("@core/community/app-workspace", () => ({
  resolveAppWorkspaceForServerComponent: mockResolveAppWorkspaceForServerComponent,
}));

jest.mock("@features/stripe-connect/services/representative-community", () => ({
  resolveRepresentativeCommunitySelection: mockResolveRepresentativeCommunitySelection,
  updateRepresentativeCommunitySelection: mockUpdateRepresentativeCommunitySelection,
}));

jest.mock("@features/stripe-connect/services/factories", () => {
  const buildAccount = (overrides: Record<string, unknown> = {}) => ({
    id: "profile-1",
    owner_user_id: defaultUserId,
    stripe_account_id: "acct_test",
    status: "unverified",
    charges_enabled: false,
    payouts_enabled: false,
    representative_community_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  const __mockStripeConnectService = {
    buildAccount,
    getConnectAccountByUser: jest.fn().mockResolvedValue(buildAccount()),
    getConnectAccountForCommunity: jest.fn().mockResolvedValue(buildAccount()),
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
    updateBusinessProfile: jest.fn().mockResolvedValue({
      success: true,
      data: {
        accountId: "acct_test",
        updatedFields: ["url"],
      },
    }),
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

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
  createServerComponentSupabaseClient: jest.fn(),
}));

jest.mock("next/cache", () => ({
  unstable_cache: (fn: any) => fn,
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
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
  const mockGetCurrentUserForServerAction = getCurrentUserForServerAction as jest.MockedFunction<
    typeof getCurrentUserForServerAction
  >;

  beforeAll(() => {
    mockSupabase = setupSupabaseClientMocks();
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
    supabaseAuthMock.setError(false);
    supabaseAuthMock.setUser({
      id: defaultUserId,
      email: "u@example.com",
    } as any);
    mockGetCurrentUserForServerAction.mockResolvedValue({
      id: defaultUserId,
      email: "u@example.com",
    } as any);

    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      success: true,
      data: {
        currentCommunity: {
          id: "community-1",
          name: "Community 1",
          slug: "community-1",
        },
      },
    });
    mockResolveCurrentCommunityForServerComponent.mockResolvedValue({
      currentCommunity: {
        id: "community-1",
        name: "Community 1",
        slug: "community-1",
      },
    });
    mockResolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentUser: {
        id: defaultUserId,
      },
      currentCommunity: {
        id: "community-1",
        name: "Community 1",
        slug: "community-1",
      },
    });
    mockResolveRepresentativeCommunitySelection.mockResolvedValue({
      success: true,
      data: {
        id: representativeCommunityId,
        name: "Community 1",
        slug: "community-1",
        publicPageUrl: "http://localhost:3000/c/community-1",
      },
    });
    mockUpdateRepresentativeCommunitySelection.mockResolvedValue({
      success: true,
      data: undefined,
    });

    const { __mockStripeConnectService } = jest.requireMock(
      "@features/stripe-connect/services/factories"
    );
    const baseAccount = __mockStripeConnectService.buildAccount();
    __mockStripeConnectService.getConnectAccountByUser.mockReset();
    __mockStripeConnectService.getConnectAccountForCommunity.mockReset();
    __mockStripeConnectService.createExpressAccount.mockReset();
    __mockStripeConnectService.createAccountLink.mockReset();
    __mockStripeConnectService.createLoginLink.mockReset();
    __mockStripeConnectService.updateAccountStatus.mockReset();
    __mockStripeConnectService.updateBusinessProfile.mockReset();
    __mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(baseAccount);
    __mockStripeConnectService.getConnectAccountForCommunity.mockResolvedValue(baseAccount);
    __mockStripeConnectService.createExpressAccount.mockResolvedValue({
      accountId: "acct_test",
      status: "unverified",
    });
    __mockStripeConnectService.createAccountLink.mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    __mockStripeConnectService.createLoginLink.mockResolvedValue({
      url: "https://connect.stripe.com/express/acct_test/login",
      created: Math.floor(Date.now() / 1000),
    });
    __mockStripeConnectService.updateAccountStatus.mockResolvedValue(undefined);
    __mockStripeConnectService.updateBusinessProfile.mockResolvedValue({
      success: true,
      data: {
        accountId: "acct_test",
        updatedFields: ["url"],
      },
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
    it("代表コミュニティを保存して Stripe オンボーディングへリダイレクトする", async () => {
      const { startOnboardingAction } = require("@features/stripe-connect/server");
      const formData = new FormData();
      formData.set("representativeCommunityId", representativeCommunityId);

      const result = await startOnboardingAction(formData);

      expect(result.success).toBe(true);
      expect(redirect).toHaveBeenCalledWith(expect.stringContaining("https://connect.stripe.com"));
      expect(mockResolveRepresentativeCommunitySelection).toHaveBeenCalledWith(
        mockSupabase,
        defaultUserId,
        representativeCommunityId
      );
      expect(mockUpdateRepresentativeCommunitySelection).toHaveBeenCalledWith(
        mockSupabase,
        "profile-1",
        representativeCommunityId
      );
      expect(logger.withContext().info).toHaveBeenCalledWith(
        "Stripe Connect onboarding started",
        expect.objectContaining({
          user_id: defaultUserId,
          communityId: representativeCommunityId,
          requestedCommunityId: representativeCommunityId,
          payoutProfileId: "profile-1",
          stripe_account_id: "acct_test",
          outcome: "success",
        })
      );
    });

    it("connect account新規作成時に business profile url を渡す", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      __mockStripeConnectService.getConnectAccountByUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(__mockStripeConnectService.buildAccount());

      const { startOnboardingAction } = require("@features/stripe-connect/server");
      const formData = new FormData();
      formData.set("representativeCommunityId", representativeCommunityId);

      await startOnboardingAction(formData);

      expect(__mockStripeConnectService.createExpressAccount).toHaveBeenCalledWith({
        userId: defaultUserId,
        email: "u@example.com",
        country: "JP",
        businessProfile: {
          productDescription:
            "イベントを企画・運営しています。イベント管理プラットフォームの「みんなの集金」のシステムを利用して、イベント開催時の参加費や会費の事前決済を行います。",
          url: "http://localhost:3000/c/community-1",
        },
      });
      expect(__mockStripeConnectService.updateBusinessProfile).toHaveBeenCalledWith({
        accountId: "acct_test",
        businessProfile: {
          url: "http://localhost:3000/c/community-1",
        },
      });
    });

    it("代表コミュニティ未指定なら validation error を返す", async () => {
      const { startOnboardingAction } = require("@features/stripe-connect/server");

      const result = await startOnboardingAction(new FormData());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.fieldErrors?.representativeCommunityId).toEqual([
          "Stripe アカウント設定に使うコミュニティを選択してください",
        ]);
      }
    });
  });

  describe("getStripeBalanceAction", () => {
    it("should return cached balance (calculated from available + pending)", async () => {
      const { getStripeBalanceAction } = require("@features/stripe-connect/server");
      (mockSupabase.from as jest.Mock).mockImplementation((tableName) => {
        if (tableName === "communities") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { current_payout_profile_id: "profile-1" },
                  error: null,
                }),
              }),
            }),
          } as any;
        }

        if (tableName === "payout_profiles") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: "profile-1",
                    owner_user_id: defaultUserId,
                    stripe_account_id: "acct_test_123",
                    status: "verified",
                    charges_enabled: true,
                    payouts_enabled: true,
                    representative_community_id: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }

        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        } as any;
      });

      const result = await getStripeBalanceAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(1500);
      }
    });

    it("returns 0 when current community has no payout profile", async () => {
      const { getStripeBalanceAction } = require("@features/stripe-connect/server");
      (mockSupabase.from as jest.Mock).mockImplementation((tableName) => {
        if (tableName === "communities") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { current_payout_profile_id: null },
                  error: null,
                }),
              }),
            }),
          } as any;
        }

        throw new Error(`unexpected table lookup: ${tableName}`);
      });

      const result = await getStripeBalanceAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });
  });

  describe("getConnectAccountStatusAction", () => {
    it("should return account status when account exists", async () => {
      const { getConnectAccountStatusAction } = require("@features/stripe-connect/server");

      const result = await getConnectAccountStatusAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasAccount).toBe(true);
        expect(result.data.accountId).toBe("acct_test");
        expect(result.data.dbStatus).toBe("unverified");
      }
    });

    it("returns no_account when current community has no payout profile", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      __mockStripeConnectService.getConnectAccountForCommunity.mockResolvedValueOnce(null);

      const { getConnectAccountStatusAction } = require("@features/stripe-connect/server");
      const result = await getConnectAccountStatusAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasAccount).toBe(false);
        expect(result.data.uiStatus).toBe("no_account");
        expect(result.data.chargesEnabled).toBe(false);
        expect(result.data.payoutsEnabled).toBe(false);
      }
    });

    it("should fall back to cached account status when sync fails", async () => {
      const { __mockStripeConnectService } = jest.requireMock(
        "@features/stripe-connect/services/factories"
      );
      const { StatusSyncService } = jest.requireMock(
        "@features/stripe-connect/services/status-sync-service"
      );
      const readyAccount = __mockStripeConnectService.buildAccount({
        charges_enabled: true,
        payouts_enabled: true,
        status: "verified",
      });

      __mockStripeConnectService.getConnectAccountForCommunity
        .mockResolvedValueOnce(readyAccount)
        .mockResolvedValueOnce(readyAccount);
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
      __mockStripeConnectService.getConnectAccountForCommunity.mockResolvedValueOnce(null);

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
