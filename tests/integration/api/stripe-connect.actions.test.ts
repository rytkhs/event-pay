//

import { createConnectAccountAction } from "../../features/stripe-connect/actions/connect-account";

// Stripe / service 層のモック（最小）
jest.mock("@features/stripe-connect/services", () => {
  const actual = jest.requireActual("@features/stripe-connect/services");
  return {
    ...actual,
    createUserStripeConnectService: jest.fn().mockReturnValue({
      getConnectAccountByUser: jest.fn().mockResolvedValue(null),
      createExpressAccount: jest
        .fn()
        .mockResolvedValue({ accountId: "acct_test", status: "unverified" }),
      createAccountLink: jest.fn().mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_test/session_token",
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      }),
    }),
  };
});

// Supabase 認証モック
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

describe("Stripe Connect actions", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
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
    const fd = new FormData();
    // 故意に http を指定
    fd.set("refreshUrl", "http://example.com/dashboard/connect/refresh");
    fd.set("returnUrl", "http://example.com/dashboard/connect/return");

    await expect(createConnectAccountAction(fd)).rejects.toThrow(/HTTPS/);

    // 後片付け
    process.env.NODE_ENV = "test";
  });
});
