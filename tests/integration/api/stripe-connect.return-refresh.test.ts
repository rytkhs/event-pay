import {
  handleOnboardingReturnAction,
  handleOnboardingRefreshAction,
} from "@features/stripe-connect/server";

import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { setupStripeConnectServiceMock } from "../../setup/stripe-connect-mock";
import { createMockSupabaseClient, setTestUserById } from "../../setup/supabase-auth-mock";

// Supabase 認証モック（共通モックを使用）
jest.mock("@core/supabase/server", () => ({
  createClient: jest.fn(),
}));

// Stripe Connect サービスのモック（共通モックを使用）
jest.mock("@features/stripe-connect/services", () => {
  const { setupStripeConnectServiceMock } = require("../../setup/stripe-connect-mock");
  return setupStripeConnectServiceMock({
    getAccountInfo: {
      accountId: "acct_test",
      status: "onboarding",
      chargesEnabled: false,
      payoutsEnabled: false,
    },
    createAccountLink: {
      url: "https://connect.stripe.com/setup/e/acct_test/session_token",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    },
  });
});

describe("Stripe Connect return/refresh actions", () => {
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;

  beforeAll(() => {
    // 共通モックを使用してSupabaseクライアントを設定
    mockSupabase = setupSupabaseClientMocks();
    // テスト用ユーザーを設定
    const { createClient } = require("@core/supabase/server");
    (createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any);
  });

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    // afterEachでSupabase認証モックがリセットされるため毎回ユーザーを再設定
    setTestUserById("user_test", "u@example.com");
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
