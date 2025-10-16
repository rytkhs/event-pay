import Stripe from "stripe";

import { StripeWebhookSignatureVerifier } from "@/features/payments/services/webhook/webhook-signature-verifier";
import { generateTestWebhookSignature } from "@/tests/setup/stripe-test-helpers";

// Stripe クライアントのモック
const mockStripe = {
  webhooks: {
    constructEvent: jest.fn(),
  },
} as unknown as Stripe;

describe("StripeWebhookSignatureVerifier", () => {
  let verifier: StripeWebhookSignatureVerifier;
  const testSecret = "whsec_test_abcdef1234567890";
  const validPayload = JSON.stringify({ type: "checkout.session.completed", id: "evt_test_123" });

  beforeEach(() => {
    jest.clearAllMocks();
    verifier = new StripeWebhookSignatureVerifier(mockStripe, testSecret);
  });

  describe("正常系テスト", () => {
    it("正しい署名で検証が成功する", async () => {
      const mockEvent = { id: "evt_test_123", type: "checkout.session.completed" };
      const signature = generateTestWebhookSignature(validPayload, testSecret);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);
      expect(result.error).toBeUndefined();
    });

    it("複数のWebhookシークレットで検証する（ローテーション対応）", async () => {
      const secrets = ["whsec_test_old", "whsec_test_new"];
      const rotationVerifier = new StripeWebhookSignatureVerifier(mockStripe, secrets);
      const mockEvent = { id: "evt_test_456", type: "payment_intent.succeeded" };
      const signature = generateTestWebhookSignature(validPayload, "whsec_test_new");

      // 最初のシークレットで失敗、2番目で成功をシミュレート
      (mockStripe.webhooks.constructEvent as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error("Invalid signature");
        })
        .mockReturnValue(mockEvent);

      const result = await rotationVerifier.verifySignature({
        payload: validPayload,
        signature,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("エラーケース: 不正な署名", () => {
    it("署名が完全に不正な場合は検証に失敗する", async () => {
      const invalidSignature = "t=1234567890,v1=invalid_signature_hash";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: invalidSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("invalid_signature");
    });

    it("署名形式が不正な場合は検証に失敗する", async () => {
      const malformedSignature = "invalid_format";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid signature format");
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: malformedSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("空の署名は検証に失敗する", async () => {
      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: "",
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });
  });

  describe("エラーケース: タイムスタンプ期限切れ", () => {
    it("古すぎるタイムスタンプは検証に失敗する", async () => {
      // 現在時刻から1時間前（デフォルト許容時間300秒を超過）
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const expiredSignature = `t=${expiredTimestamp},v1=expired_signature_hash`;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Request timestamp too old");
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: expiredSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("未来のタイムスタンプは検証に失敗する", async () => {
      // 現在時刻から1時間後
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const futureSignature = `t=${futureTimestamp},v1=future_signature_hash`;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Request timestamp too far in future");
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: futureSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });
  });

  describe("エラーケース: ペイロード改ざん", () => {
    it("ペイロードが改ざんされた場合は検証に失敗する", async () => {
      const originalPayload = JSON.stringify({
        type: "checkout.session.completed",
        id: "evt_test_123",
      });
      const signature = generateTestWebhookSignature(originalPayload, testSecret);
      const tamperedPayload = JSON.stringify({
        type: "checkout.session.completed",
        id: "evt_test_999",
      });

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Signature verification failed");
      });

      const result = await verifier.verifySignature({
        payload: tamperedPayload,
        signature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("空のペイロードは検証に失敗する", async () => {
      const signature = generateTestWebhookSignature("", testSecret);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid JSON payload");
      });

      const result = await verifier.verifySignature({
        payload: "",
        signature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("不正なJSONペイロードは検証に失敗する", async () => {
      const invalidJson = "{ invalid json }";
      const signature = generateTestWebhookSignature(invalidJson, testSecret);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid JSON payload");
      });

      const result = await verifier.verifySignature({
        payload: invalidJson,
        signature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });
  });

  describe("エラーケース: Webhookシークレット", () => {
    it("不正なWebhookシークレットは検証に失敗する", async () => {
      const wrongSecret = "whsec_test_wrong_secret";
      const signature = generateTestWebhookSignature(validPayload, wrongSecret);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature");
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("複数シークレット全てで失敗した場合は検証に失敗する", async () => {
      const secrets = ["whsec_test_wrong1", "whsec_test_wrong2"];
      const multiSecretVerifier = new StripeWebhookSignatureVerifier(mockStripe, secrets);
      const signature = generateTestWebhookSignature(validPayload, "whsec_test_correct");

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature");
      });

      const result = await multiSecretVerifier.verifySignature({
        payload: validPayload,
        signature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
      // すべてのシークレットで試行されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("タイムスタンプ抽出テスト", () => {
    it("署名からタイムスタンプを正しく抽出する", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp},v1=test_signature`;
      const mockEvent = { id: "evt_test_789", type: "invoice.paid" };

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      await verifier.verifySignature({
        payload: validPayload,
        signature,
      });

      // constructEventが正しいタイムスタンプで呼び出されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        validPayload,
        signature,
        testSecret,
        300 // デフォルトの許容秒数
      );
    });
  });
});
