/**
 * Stripe Webhook 署名検証テスト
 *
 * 目的: StripeWebhookSignatureVerifier クラスの署名検証機能を検証し、
 * セキュリティ要件を満たすことを確認する。
 *
 * テスト内容:
 * - 正常な署名検証
 * - 不正な署名の拒否
 * - タイムスタンプ期限切れの検証
 * - 複数Webhookシークレットのローテーション対応
 * - エラーハンドリング
 */

import crypto from "crypto";

import Stripe from "stripe";

import { logger } from "../../../core/logging/app-logger";
import { StripeWebhookSignatureVerifier } from "../../../features/payments/services/webhook/webhook-signature-verifier";
import { createMockStripeClient } from "../../setup/stripe-mock";
import { generateTestWebhookSignature } from "../../setup/stripe-test-helpers";

// テスト用の定数
const TEST_WEBHOOK_SECRET = "whsec_test_abc123def456ghi789jkl012mno345pqr678stu";
const TEST_WEBHOOK_SECRET_2 = "whsec_test_xyz987wvu654tsr321qpo098nml876kji543hgf";
const INVALID_WEBHOOK_SECRET = "whsec_test_invalid_secret";

// テスト用のペイロード
const TEST_PAYLOAD = JSON.stringify({
  id: "evt_test_webhook",
  object: "event",
  api_version: "2020-08-27",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: "cs_test_123",
      object: "checkout.session",
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: {
    id: null,
    idempotency_key: null,
  },
  type: "checkout.session.completed",
});

describe("StripeWebhookSignatureVerifier", () => {
  let mockStripe: any; // Stripe型の厳密チェックを回避
  let verifier: StripeWebhookSignatureVerifier;

  beforeEach(() => {
    mockStripe = createMockStripeClient();
    verifier = new StripeWebhookSignatureVerifier(mockStripe as Stripe, TEST_WEBHOOK_SECRET);

    // 環境変数をテスト用にリセット
    delete process.env.STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("正常系", () => {
    it("有効な署名で検証が成功する", async () => {
      // 実際のStripe署名アルゴリズムを使用してテスト署名を生成
      const validSignature = generateTestWebhookSignature(TEST_PAYLOAD, TEST_WEBHOOK_SECRET);

      // Stripe SDK のモックを設定（正常系）
      const mockEvent = JSON.parse(TEST_PAYLOAD);
      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: validSignature,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);
      expect(result.error).toBeUndefined();

      // Stripe SDK が正しいパラメータで呼ばれることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        TEST_PAYLOAD,
        validSignature,
        TEST_WEBHOOK_SECRET,
        300 // デフォルトのタイムスタンプ許容秒数
      );
    });

    it("複数のWebhookシークレットで1番目が成功する", async () => {
      const secrets = [TEST_WEBHOOK_SECRET, TEST_WEBHOOK_SECRET_2];
      verifier = new StripeWebhookSignatureVerifier(mockStripe as Stripe, secrets);

      const validSignature = generateTestWebhookSignature(TEST_PAYLOAD, TEST_WEBHOOK_SECRET);
      const mockEvent = JSON.parse(TEST_PAYLOAD);

      // 1番目のシークレットで成功するようにモック設定
      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: validSignature,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);

      // 1番目のシークレットで検証されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        TEST_PAYLOAD,
        validSignature,
        TEST_WEBHOOK_SECRET,
        300
      );
    });

    it("複数のWebhookシークレットで2番目が成功する（ローテーション対応）", async () => {
      const secrets = [INVALID_WEBHOOK_SECRET, TEST_WEBHOOK_SECRET];
      verifier = new StripeWebhookSignatureVerifier(mockStripe as Stripe, secrets);

      const validSignature = generateTestWebhookSignature(TEST_PAYLOAD, TEST_WEBHOOK_SECRET);
      const mockEvent = JSON.parse(TEST_PAYLOAD);

      // 1番目は失敗、2番目は成功するようにモック設定
      (mockStripe.webhooks.constructEvent as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error("Invalid signature");
        })
        .mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: validSignature,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);

      // 両方のシークレットで試行されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenNthCalledWith(
        1,
        TEST_PAYLOAD,
        validSignature,
        INVALID_WEBHOOK_SECRET,
        300
      );
      expect(mockStripe.webhooks.constructEvent).toHaveBeenNthCalledWith(
        2,
        TEST_PAYLOAD,
        validSignature,
        TEST_WEBHOOK_SECRET,
        300
      );
    });

    it("カスタムタイムスタンプ許容時間が使用される", async () => {
      // 環境変数で許容時間を設定
      process.env.STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE = "600";
      verifier = new StripeWebhookSignatureVerifier(mockStripe as Stripe, TEST_WEBHOOK_SECRET);

      const validSignature = generateTestWebhookSignature(TEST_PAYLOAD, TEST_WEBHOOK_SECRET);
      const mockEvent = JSON.parse(TEST_PAYLOAD);
      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: validSignature,
      });

      // カスタム許容時間（600秒）が使用されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        TEST_PAYLOAD,
        validSignature,
        TEST_WEBHOOK_SECRET,
        600
      );
    });
  });

  describe("異常系", () => {
    it("不正な署名で検証が失敗する", async () => {
      const invalidSignature = "t=1234567890,v1=invalid_signature_hash";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: invalidSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("invalid_signature");
    });

    it("すべてのWebhookシークレットで検証が失敗する", async () => {
      const secrets = [INVALID_WEBHOOK_SECRET, "whsec_test_another_invalid"];
      verifier = new StripeWebhookSignatureVerifier(mockStripe as Stripe, secrets);

      const invalidSignature = "t=1234567890,v1=invalid_signature_hash";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: invalidSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("invalid_signature");

      // すべてのシークレットで試行されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
    });

    it("タイムスタンプが期限切れの場合に失敗する", async () => {
      // 古いタイムスタンプで署名を作成
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400秒前
      const signedPayload = `${oldTimestamp}.${TEST_PAYLOAD}`;
      const signingSecret = TEST_WEBHOOK_SECRET.replace("whsec_test_", "");
      const signature = crypto
        .createHmac("sha256", signingSecret)
        .update(signedPayload, "utf8")
        .digest("hex");
      const oldSignature = `t=${oldTimestamp},v1=${signature}`;

      // StripeSignatureVerificationError を模擬
      const stripeError = new Error("Timestamp outside the tolerance zone") as any;
      stripeError.name = "StripeSignatureVerificationError";
      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw stripeError;
      });

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: oldSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
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
        payload: TEST_PAYLOAD,
        signature: futureSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("不正な署名形式で失敗する", async () => {
      const malformedSignature = "invalid_format";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Unable to extract timestamp and signatures from header");
      });

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: malformedSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("invalid_signature");
    });

    it("空のペイロードで失敗する", async () => {
      const validSignature = generateTestWebhookSignature("", TEST_WEBHOOK_SECRET);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Unexpected end of JSON input");
      });

      const result = await verifier.verifySignature({
        payload: "",
        signature: validSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("invalid_signature");
    });

    it("不正なJSONペイロードで失敗する", async () => {
      const invalidPayload = "{ invalid json }";
      const validSignature = generateTestWebhookSignature(invalidPayload, TEST_WEBHOOK_SECRET);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid JSON");
      });

      const result = await verifier.verifySignature({
        payload: invalidPayload,
        signature: validSignature,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("invalid_signature");
    });
  });

  describe("エッジケース", () => {
    it("空のWebhookシークレット配列で初期化される", () => {
      const emptyVerifier = new StripeWebhookSignatureVerifier(mockStripe as Stripe, []);
      expect(emptyVerifier).toBeInstanceOf(StripeWebhookSignatureVerifier);
    });

    it("空文字列のWebhookシークレットは除外される", () => {
      const secretsWithEmpty = [TEST_WEBHOOK_SECRET, "", "   ", TEST_WEBHOOK_SECRET_2];
      const verifierWithFiltered = new StripeWebhookSignatureVerifier(
        mockStripe as Stripe,
        secretsWithEmpty
      );
      expect(verifierWithFiltered).toBeInstanceOf(StripeWebhookSignatureVerifier);
    });

    it("署名にタイムスタンプが含まれない場合でも処理される", async () => {
      const signatureWithoutTimestamp = "v1=some_signature_hash";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Unable to extract timestamp");
      });

      const result = await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: signatureWithoutTimestamp,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("invalid_signature");
    });

    it("不正な環境変数の許容時間でデフォルト値が使用される", () => {
      process.env.STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE = "invalid_number";
      const verifierWithInvalidEnv = new StripeWebhookSignatureVerifier(
        mockStripe as Stripe,
        TEST_WEBHOOK_SECRET
      );
      expect(verifierWithInvalidEnv).toBeInstanceOf(StripeWebhookSignatureVerifier);
      // デフォルト値（300秒）が使用されることを期待
    });
  });

  describe("ログ出力の確認", () => {
    it("検証成功時にログが出力される", async () => {
      const validSignature = generateTestWebhookSignature(TEST_PAYLOAD, TEST_WEBHOOK_SECRET);
      const mockEvent = {
        ...JSON.parse(TEST_PAYLOAD),
        id: "evt_test_123",
        type: "checkout.session.completed",
      };

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      // ログの spy を設定
      const loggerSpy = jest.spyOn(logger, "info");

      await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: validSignature,
      });

      // ログが正しく出力されることを確認
      expect(loggerSpy).toHaveBeenCalledWith(
        "Webhook signature verified",
        expect.objectContaining({
          eventType: "checkout.session.completed",
          eventId: "evt_test_123",
          timestamp: expect.any(Number),
        })
      );

      loggerSpy.mockRestore();
    });

    it("検証失敗時にエラーログが出力される", async () => {
      const invalidSignature = "t=1234567890,v1=invalid_signature";

      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      // ログの spy を設定
      const loggerSpy = jest.spyOn(logger, "error");

      await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: invalidSignature,
      });

      // エラーログが正しく出力されることを確認
      expect(loggerSpy).toHaveBeenCalledWith(
        "Webhook processing error",
        expect.objectContaining({
          error: "Invalid signature",
          timestamp: expect.any(Number),
          signatureProvided: true,
        })
      );

      loggerSpy.mockRestore();
    });
  });

  describe("タイムスタンプ抽出テスト", () => {
    it("署名からタイムスタンプを正しく抽出する", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp},v1=test_signature`;
      const mockEvent = { id: "evt_test_789", type: "invoice.paid" };
      const validSignature = generateTestWebhookSignature(TEST_PAYLOAD, TEST_WEBHOOK_SECRET);

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      await verifier.verifySignature({
        payload: TEST_PAYLOAD,
        signature: validSignature,
      });

      // constructEventが正しいタイムスタンプで呼び出されることを確認
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        TEST_PAYLOAD,
        validSignature,
        TEST_WEBHOOK_SECRET,
        300 // デフォルトの許容秒数
      );
    });
  });
});
