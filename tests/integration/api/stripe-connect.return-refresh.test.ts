import { redirect } from "next/navigation";

import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { setTestUserById } from "../../setup/supabase-auth-mock";
const originalEnv = process.env;
const defaultUserId = "550e8400-e29b-41d4-a716-446655440000";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

// Supabase 認証モック（共通モックを使用）
jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: jest.fn(),
  createServerComponentSupabaseClient: jest.fn(),
}));

const mockResolveRepresentativeCommunitySelection = jest.fn();

jest.mock("@features/stripe-connect/services/representative-community", () => ({
  resolveRepresentativeCommunitySelection: mockResolveRepresentativeCommunitySelection,
  updateRepresentativeCommunitySelection: jest.fn(),
}));

jest.mock("@features/stripe-connect/services/factories", () => {
  const buildAccount = (ownerUserId = "550e8400-e29b-41d4-a716-446655440000") => ({
    id: "profile-1",
    owner_user_id: ownerUserId,
    stripe_account_id: "acct_test",
    status: "unverified",
    charges_enabled: false,
    payouts_enabled: false,
    representative_community_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const __mockStripeConnectService = {
    getConnectAccountByUser: jest.fn().mockResolvedValue(buildAccount()),
    createExpressAccount: jest.fn().mockResolvedValue({
      accountId: "acct_test",
      status: "unverified",
    }),
    createAccountLink: jest.fn().mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
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

describe("Stripe Connect return/refresh actions", () => {
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;

  beforeAll(() => {
    // 共通モックを使用してSupabaseクライアントを設定
    mockSupabase = setupSupabaseClientMocks();
    // テスト用ユーザーを設定
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
    // afterEachでSupabase認証モックがリセットされるため毎回ユーザーを再設定
    setTestUserById(defaultUserId, "u@example.com");
    const { __mockStripeConnectService } = jest.requireMock(
      "@features/stripe-connect/services/factories"
    );
    __mockStripeConnectService.getConnectAccountByUser.mockReset();
    __mockStripeConnectService.createAccountLink.mockReset();
    __mockStripeConnectService.updateBusinessProfile.mockReset();
    __mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
      id: "profile-1",
      owner_user_id: defaultUserId,
      stripe_account_id: "acct_test",
      status: "unverified",
      charges_enabled: false,
      payouts_enabled: false,
      representative_community_id: "community-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    __mockStripeConnectService.updateBusinessProfile.mockResolvedValue({
      success: true,
      data: {
        accountId: "acct_test",
        updatedFields: ["url"],
      },
    });
    __mockStripeConnectService.createAccountLink.mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    mockResolveRepresentativeCommunitySelection.mockResolvedValue({
      success: true,
      data: {
        id: "community-1",
        name: "Community 1",
        slug: "community-1",
        publicPageUrl: "http://localhost:3000/c/community-1",
      },
    });
    (redirect as unknown as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("return action: 既存アカウント同期を実行する", async () => {
    const { handleOnboardingReturnAction } = require("@features/stripe-connect/server");
    const { __mockStripeConnectService } = jest.requireMock(
      "@features/stripe-connect/services/factories"
    );

    const result = await handleOnboardingReturnAction();
    expect(result.success).toBe(true);
    expect(__mockStripeConnectService.getConnectAccountByUser).toHaveBeenCalled();
  });

  it("refresh action: アカウントリンクを再生成してリダイレクトする", async () => {
    const { handleOnboardingRefreshAction } = require("@features/stripe-connect/server");
    const { __mockStripeConnectService } = jest.requireMock(
      "@features/stripe-connect/services/factories"
    );

    await handleOnboardingRefreshAction();
    expect(__mockStripeConnectService.getConnectAccountByUser).toHaveBeenCalled();
    expect(__mockStripeConnectService.updateBusinessProfile).toHaveBeenCalledWith({
      accountId: "acct_test",
      businessProfile: {
        url: "http://localhost:3000/c/community-1",
      },
    });
    expect(__mockStripeConnectService.createAccountLink).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("https://connect.stripe.com"));
  });

  it("refresh action: representative community 未設定なら error page へリダイレクトする", async () => {
    const { handleOnboardingRefreshAction } = require("@features/stripe-connect/server");
    const { __mockStripeConnectService } = jest.requireMock(
      "@features/stripe-connect/services/factories"
    );
    __mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
      id: "profile-1",
      owner_user_id: defaultUserId,
      stripe_account_id: "acct_test",
      status: "unverified",
      charges_enabled: false,
      payouts_enabled: false,
      representative_community_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await handleOnboardingRefreshAction();

    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/settings/payments/error"));
  });
});
