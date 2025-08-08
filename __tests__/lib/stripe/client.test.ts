import { stripe, testStripeConnection, stripeConfig, getWebhookSecret } from "@/lib/stripe/client";

// Stripeモック
jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    accounts: {
      retrieve: jest.fn(),
      create: jest.fn(),
    },
    accountLinks: {
      create: jest.fn(),
    },
  }));
});

describe("Stripe Client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("環境変数の検証", () => {
    it("必要な環境変数が設定されている場合、stripeConfigが正しく初期化される", () => {
      expect(stripeConfig.secretKey).toBeDefined();
      expect(stripeConfig.publishableKey).toBeDefined();
      expect(stripeConfig.appUrl).toBeDefined();
    });

    it("WebhookシークレットはgetWebhookSecret経由で取得する", () => {
      const secret = getWebhookSecret();
      expect(secret).toBeDefined();
    });
  });

  describe("testStripeConnection", () => {
    it("Stripe接続が成功した場合、successがtrueを返す", async () => {
      const mockAccount = { id: "acct_test_123" };
      (stripe.accounts.retrieve as jest.Mock).mockResolvedValue(mockAccount);

      const result = await testStripeConnection();

      expect(result.success).toBe(true);
      expect(result.accountId).toBe("acct_test_123");
      expect(result.error).toBeUndefined();
    });

    it("Stripe接続が失敗した場合、successがfalseとエラーメッセージを返す", async () => {
      const mockError = new Error("API key invalid");
      (stripe.accounts.retrieve as jest.Mock).mockRejectedValue(mockError);

      const result = await testStripeConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe("API key invalid");
      expect(result.accountId).toBeUndefined();
    });

    it("不明なエラーの場合、適切なエラーメッセージを返す", async () => {
      (stripe.accounts.retrieve as jest.Mock).mockRejectedValue("Unknown error");

      const result = await testStripeConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });
  });
});
