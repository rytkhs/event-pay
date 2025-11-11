//

import { createConnectAccountAction } from "@features/stripe-connect/actions/connect-account";
import { setupSupabaseClientMocks } from "../../setup/common-mocks";
import { createMockSupabaseClient, setTestUserById } from "../../setup/supabase-auth-mock";

// Stripe Connect サービスのモック（共通モックを使用）
jest.mock("@features/stripe-connect/services", () => {
  const { setupStripeConnectServiceMock } = jest.requireActual<
    typeof import("../../setup/stripe-connect-mock")
  >("../../setup/stripe-connect-mock");

  return setupStripeConnectServiceMock({
    getConnectAccountByUser: null,
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

jest.mock("@core/utils/cloudflare-env", () => {
  const defaultEnv = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SITE_URL: undefined,
    VERCEL_URL: undefined,
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
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_URL: undefined,
      ALLOWED_ORIGINS: undefined,
      FORCE_SECURE_COOKIES: "false",
      NODE_ENV: process.env.NODE_ENV,
      COOKIE_DOMAIN: undefined,
    });
  });

  it("URL不正でエラーを投げる (refresh/return のパス不一致)", async () => {
    const fd = new FormData();
    fd.set("refreshUrl", "http://localhost:3000/invalid");
    fd.set("returnUrl", "http://localhost:3000/also-invalid");

    await expect(createConnectAccountAction(fd)).rejects.toThrow();
  });

  it("本番環境ではHTTPのURLを拒否する", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    getEnvMock.mockReturnValue({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_URL: undefined,
      ALLOWED_ORIGINS: undefined,
      FORCE_SECURE_COOKIES: "true",
      NODE_ENV: process.env.NODE_ENV,
      COOKIE_DOMAIN: "example.com",
    });
    const fd = new FormData();
    // 故意に http を指定
    fd.set("refreshUrl", "http://example.com/dashboard/connect/refresh");
    fd.set("returnUrl", "http://example.com/dashboard/connect/return");

    await expect(createConnectAccountAction(fd)).rejects.toThrow(/HTTPS/);

    // 後片付け
    process.env.NODE_ENV = "test";
  });
});
