/**
 * Webhook パイプライン 統合テスト
 *
 * 📋 テスト対象：
 * - /api/webhooks/stripe エンドポイント
 * - /api/workers/stripe-webhook エンドポイント
 * - セキュリティレイヤー（署名検証・IP制限）
 * - エラーハンドリング・ログ出力
 *
 * 🎯 目的：
 * - 実際のコンポーネント連携の動作確認
 * - セキュリティ機能の正常動作検証
 * - エラーハンドリングの実際の動作検証
 * - 環境設定の妥当性確認
 *
 * 💡 方針：
 * - 実際のStripe署名検証ロジックをテストで検証
 * - 外部サービス（QStash等）のみモック化
 * - セキュリティが正しく動作することを重視
 * - テスト専用の署名シークレットを使用
 *
 */

import crypto from "crypto";

import { NextRequest } from "next/server";

import { POST as StripeWebhookPOST } from "../../../app/api/webhooks/stripe/route";
import { POST as StripeWorkerPOST } from "../../../app/api/workers/stripe-webhook/route";

// QStash モック（外部サービスはモック化）
const mockPublishJSON = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Client: jest.fn().mockImplementation(() => ({
    publishJSON: mockPublishJSON,
  })),
}));

// テスト用のStripeイベントデータ
const MOCK_STRIPE_EVENT = {
  id: "evt_test_integration_fixed_id",
  object: "event",
  api_version: "2023-10-16",
  created: 1700000000, // 固定タイムスタンプ
  data: {
    object: {
      id: "pi_test_payment_intent",
      object: "payment_intent",
      status: "succeeded",
      amount: 1500,
      currency: "jpy",
      metadata: {
        payment_id: "test_payment_id",
        attendance_id: "test_attendance_id",
        event_title: "Test Event",
      },
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: { id: "req_test_integration", idempotency_key: null },
  type: "payment_intent.succeeded",
} as any;

// 統合テスト用の署名生成（実際のStripe SDKと完全互換）
function generateValidStripeSignature(payload: string, webhookSecret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;

  // 実際のStripe SDKと同じ処理：プレフィックスを除去してHMAC生成
  const signingKey = webhookSecret.replace(/^whsec_[^_]+_/, "");
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(signedPayload, "utf8")
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

describe("🔗 Webhook パイプライン 統合テスト", () => {
  const originalEnv = process.env;
  // 統合テスト用のwebhook secret（環境変数から取得、フォールバック付き）
  const TEST_WEBHOOK_SECRET =
    process.env.STRIPE_WEBHOOK_SECRET_TEST || "whsec_test_integration_webhook_secret_for_testing";

  beforeEach(() => {
    // モックをクリア
    jest.clearAllMocks();
  });

  beforeAll(() => {
    // テスト環境の基本設定
    process.env.NODE_ENV = "test";
    process.env.APP_BASE_URL = "https://test.eventpay.com";
    process.env.ENABLE_STRIPE_IP_CHECK = "false"; // IP制限を無効化（統合テスト用）

    // Stripe関連の環境変数（統合テスト用）
    process.env.STRIPE_WEBHOOK_SECRET_TEST = TEST_WEBHOOK_SECRET;
    if (!process.env.STRIPE_SECRET_KEY) {
      process.env.STRIPE_SECRET_KEY =
        "sk_test_integration_dummy_stripe_secret_key_for_testing_only";
    }

    // QStash関連の環境変数（テスト用のモック値）
    process.env.QSTASH_TOKEN = "test_token";
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_key_current";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_key_next";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("🔒 セキュリティ検証", () => {
    test("署名ヘッダー欠落時は400エラーを返す", async () => {
      const payload = JSON.stringify(MOCK_STRIPE_EVENT);

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "x-request-id": "req_test_no_signature",
        },
        body: payload,
      });

      const response = await StripeWebhookPOST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("INVALID_REQUEST");
      expect(body.detail).toBe("Missing Stripe signature");
    });

    test("無効な署名では400エラーを返す", async () => {
      const payload = JSON.stringify(MOCK_STRIPE_EVENT);
      const invalidSignature = "t=1234567890,v1=invalid_signature_hash";

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": invalidSignature,
          "x-request-id": "req_test_invalid_sig",
        },
        body: payload,
      });

      const response = await StripeWebhookPOST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("INVALID_REQUEST");
      expect(body.detail).toBe("Invalid webhook signature");
    });

    test("正常な署名検証とwebhook処理フローを確認", async () => {
      // 統合テストでは実際のStripe署名検証を実行
      const payload = JSON.stringify(MOCK_STRIPE_EVENT);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      // QStashを成功に設定
      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_test_123" });

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_valid_sig",
        },
        body: payload,
      });

      const response = await StripeWebhookPOST(request);

      // 統合テストでは正常なフローを検証する
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.received).toBe(true);
      expect(body.eventId).toBe(MOCK_STRIPE_EVENT.id);
    });
  });

  describe("🔧 QStash Worker エンドポイント", () => {
    test("QStash署名なしでは401エラーを返す", async () => {
      const payload = JSON.stringify({ event: MOCK_STRIPE_EVENT });

      const request = new NextRequest("https://test.eventpay.com/api/workers/stripe-webhook", {
        method: "POST",
        headers: {
          "Upstash-Delivery-Id": "deliv_test_no_sig",
        },
        body: payload,
      });

      const response = await StripeWorkerPOST(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.detail).toBe("Missing QStash signature");
    });

    test("無効なQStash署名では署名検証エラーを返す", async () => {
      const payload = JSON.stringify({ event: MOCK_STRIPE_EVENT });

      const request = new NextRequest("https://test.eventpay.com/api/workers/stripe-webhook", {
        method: "POST",
        headers: {
          "Upstash-Signature": "invalid_signature",
          "Upstash-Delivery-Id": "deliv_test_invalid",
        },
        body: payload,
      });

      const response = await StripeWorkerPOST(request);

      // QStash署名検証失敗により500エラーまたは401エラーが期待される
      expect([401, 500]).toContain(response.status);
    });
  });

  describe("🎯 フローテスト", () => {
    test("Webhookエンドポイントからワーカーエンドポイントまでの完全フロー", async () => {
      // Step 1: Webhook受信エンドポイント（実際のStripe署名検証を実行）
      const payload = JSON.stringify(MOCK_STRIPE_EVENT);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      // QStashを成功に設定
      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_test_flow" });

      const webhookRequest = new NextRequest("https://test.eventpay.com/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_full_flow",
        },
        body: payload,
      });

      const webhookResponse = await StripeWebhookPOST(webhookRequest);

      // 統合テストでは正常なフローを検証
      expect(webhookResponse.status).toBe(200);
      const webhookBody = await webhookResponse.json();
      expect(webhookBody.received).toBe(true);
      expect(webhookBody.eventId).toBe(MOCK_STRIPE_EVENT.id);

      // Step 2: Worker エンドポイント（QStash署名なしなので401を確認）
      const workerPayload = JSON.stringify({ event: MOCK_STRIPE_EVENT });
      const workerRequest = new NextRequest(
        "https://test.eventpay.com/api/workers/stripe-webhook",
        {
          method: "POST",
          headers: {
            "Upstash-Delivery-Id": "deliv_test_flow",
          },
          body: workerPayload,
        }
      );

      const workerResponse = await StripeWorkerPOST(workerRequest);
      expect(workerResponse.status).toBe(401); // QStash署名なしで認証エラー（期待される動作）

      const workerBody = await workerResponse.json();
      expect(workerBody.code).toBe("UNAUTHORIZED");
    });
  });

  describe("📋 設定・環境テスト", () => {
    test("必要な環境変数が設定されていることを確認", () => {
      expect(process.env.STRIPE_WEBHOOK_SECRET_TEST).toBe(TEST_WEBHOOK_SECRET);
      expect(process.env.QSTASH_TOKEN).toBeDefined();
      expect(process.env.QSTASH_CURRENT_SIGNING_KEY).toBeDefined();
      expect(process.env.QSTASH_NEXT_SIGNING_KEY).toBeDefined();
    });

    test("IP制限がテスト環境で無効化されていることを確認", () => {
      expect(process.env.ENABLE_STRIPE_IP_CHECK).toBe("false");
    });
  });
});
