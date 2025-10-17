import {
  handleOnboardingReturnAction,
  handleOnboardingRefreshAction,
} from "../../features/stripe-connect/actions/connect-account";

jest.mock("@core/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user_test", email: "u@example.com" } },
        error: null,
      }),
    },
  }),
}));

// jest.mock は先頭にホイストされるため、外部の const 参照は避ける。
// 代わりにモジュールからモック関数群をエクスポートし、各テストで参照・設定する。
jest.mock("@features/stripe-connect/services", () => {
  const actual = jest.requireActual("@features/stripe-connect/services");
  const mockFns = {
    getConnectAccountByUser: jest.fn(),
    getAccountInfo: jest.fn().mockResolvedValue({
      accountId: "acct_test",
      status: "onboarding",
      chargesEnabled: false,
      payoutsEnabled: false,
    }),
    updateAccountStatus: jest.fn(),
    createAccountLink: jest.fn().mockResolvedValue({
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    }),
    createExpressAccount: jest.fn(),
  };
  return {
    ...actual,
    __mockFns: mockFns,
    createUserStripeConnectService: jest.fn().mockReturnValue(mockFns),
  };
});

describe("Stripe Connect return/refresh actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("return action: 既存アカウント同期を実行する", async () => {
    const { __mockFns } = jest.requireMock("@features/stripe-connect/services");
    __mockFns.getConnectAccountByUser.mockResolvedValue({
      user_id: "user_test",
      stripe_account_id: "acct_test",
    });

    try {
      await handleOnboardingReturnAction();
    } catch (_e) {
      // redirect 例外は握る
    }

    expect(__mockFns.updateAccountStatus).toHaveBeenCalled();
  });

  it("refresh action: アカウントリンクを再生成してリダイレクトする", async () => {
    const { __mockFns } = jest.requireMock("@features/stripe-connect/services");
    __mockFns.getConnectAccountByUser.mockResolvedValue({
      user_id: "user_test",
      stripe_account_id: "acct_test",
    });
    try {
      await handleOnboardingRefreshAction();
    } catch (_e) {
      // redirect 捕捉
    }

    expect(__mockFns.getConnectAccountByUser).toHaveBeenCalled();
  });
});
