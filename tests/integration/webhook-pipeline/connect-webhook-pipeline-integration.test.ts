/**
 * Stripe Connect Webhook パイプライン 統合テスト
 *
 * 📋 テスト対象：
 * - /api/webhooks/stripe-connect エンドポイント
 * - /api/workers/stripe-connect-webhook エンドポイント
 * - AccountStatusClassifier による分類ロジック
 * - セキュリティレイヤー（署名検証・IP制限）
 *
 * 🎯 目的：
 * - account.updated イベントの処理フロー検証
 * - ステータス分類ロジックの統合動作確認
 * - セキュリティ機能の正常動作検証
 *
 * 要件:
 * - 5.1: account.updated Webhookを購読する
 * - 5.2: Account Objectを取得してClassification Algorithmを実行する
 * - 5.3: capabilities.* の status または requirements が変化したとき、Status Synchronizationを実行する
 * - 5.4: payouts_enabled または charges_enabled が変化したとき、Status Synchronizationを実行する
 */

import crypto from "crypto";

import { NextRequest } from "next/server";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { POST as ConnectWebhookPOST } from "../../../app/api/webhooks/stripe-connect/route";
import { POST as ConnectWorkerPOST } from "../../../app/api/workers/stripe-connect-webhook/route";
import { createOwnedCommunityFixture } from "../../helpers/community-owner-fixtures";
import { createTestUser, deleteTestUser, type TestUser } from "../../helpers/test-user";

// QStash モック（外部サービスはモック化）
const mockPublishJSON = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Client: jest.fn().mockImplementation(() => ({
    publishJSON: mockPublishJSON,
  })),
  Receiver: jest.fn().mockImplementation(() => ({
    verify: jest.fn().mockResolvedValue(true),
  })),
}));

// テスト用のStripe Account Objectデータ
const createMockAccountEvent = (accountData: Partial<any>) => ({
  id: "evt_test_account_updated",
  object: "event",
  api_version: "2023-10-16",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: "acct_test_123",
      object: "account",
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
      metadata: {
        actor_id: "00000000-0000-4000-8000-000000000000",
      },
      requirements: {
        currently_due: [],
        past_due: [],
        eventually_due: [],
        disabled_reason: null,
      },
      capabilities: {
        transfers: "inactive",
        card_payments: "inactive",
      },
      ...accountData,
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: { id: "req_test_account", idempotency_key: null },
  type: "account.updated",
});

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

describe("🔗 Connect Webhook パイプライン 統合テスト", () => {
  const originalEnv = process.env;
  const createdUsers: TestUser[] = [];
  // 統合テスト用のwebhook secret
  const TEST_WEBHOOK_SECRET =
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST ||
    "whsec_test_connect_integration_webhook_secret";

  beforeAll(() => {
    // テスト環境の基本設定
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.NEXT_PUBLIC_APP_URL = "https://test.eventpay.com";
    process.env.ENABLE_STRIPE_IP_CHECK = "false"; // IP制限を無効化

    // Stripe関連の環境変数
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST = TEST_WEBHOOK_SECRET;
    if (!process.env.STRIPE_SECRET_KEY) {
      process.env.STRIPE_SECRET_KEY = "sk_test_integration_dummy_key";
    }

    // QStash関連の環境変数
    process.env.QSTASH_TOKEN = "test_token";
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_key_current";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_key_next";
    delete process.env.SKIP_QSTASH_IN_TEST;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SKIP_QSTASH_IN_TEST;
  });

  afterAll(async () => {
    for (const user of createdUsers) {
      await deleteTestUser(user.email);
    }
  });

  describe("🔒 セキュリティ検証", () => {
    test("署名ヘッダー欠落時は400エラーを返す", async () => {
      const event = createMockAccountEvent({});
      const payload = JSON.stringify(event);

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "x-request-id": "req_test_no_signature",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);
      const body = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(body.code).toBe("MISSING_PARAMETER");
      expect(body.detail).toBe("Missing signature");
    });

    test("無効な署名では400エラーを返す", async () => {
      const event = createMockAccountEvent({});
      const payload = JSON.stringify(event);
      const invalidSignature = "t=1234567890,v1=invalid_signature_hash";

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": invalidSignature,
          "x-request-id": "req_test_invalid_sig",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);
      const body = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(body.code).toBe("INVALID_REQUEST");
      expect(body.detail).toBe("Invalid signature");
    });

    test("正常な署名検証とwebhook処理フローを確認", async () => {
      const event = createMockAccountEvent({});
      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      // QStashを成功に設定
      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_test_123" });

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_valid_sig",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);

      expect(response.status).toBe(204);
      expect(response.headers.get("X-Event-Id")).toBe(event.id);
    });
  });

  describe("📊 account.updated イベント処理", () => {
    test("unverified状態のアカウントを正しく処理する", async () => {
      const event = createMockAccountEvent({
        details_submitted: false,
        payouts_enabled: false,
        capabilities: {
          transfers: "inactive",
          card_payments: "inactive",
        },
      });

      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_unverified" });

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_unverified",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);

      expect(response.status).toBe(204);
      expect(response.headers.get("X-Event-Type")).toBe("account.updated");
    });

    test("verified状態のアカウントを正しく処理する", async () => {
      const event = createMockAccountEvent({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: null,
        },
      });

      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_verified" });

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_verified",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);

      expect(response.status).toBe(204);
    });

    test("restricted状態のアカウントを正しく処理する", async () => {
      const event = createMockAccountEvent({
        details_submitted: true,
        payouts_enabled: false,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: "platform_paused",
        },
        capabilities: {
          transfers: "inactive",
          card_payments: "inactive",
        },
      });

      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_restricted" });

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_restricted",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);

      expect(response.status).toBe(204);
    });

    test("under_review状態のアカウントを正しく処理する", async () => {
      const event = createMockAccountEvent({
        details_submitted: true,
        payouts_enabled: false,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: "under_review",
        },
        capabilities: {
          transfers: "pending",
          card_payments: "pending",
        },
      });

      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_under_review" });

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_under_review",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);

      expect(response.status).toBe(204);
    });
  });

  describe("🔧 QStash Worker エンドポイント", () => {
    test("QStash署名なしでは489エラーを返す", async () => {
      const event = createMockAccountEvent({});
      const payload = JSON.stringify({ event });

      const request = new NextRequest(
        "https://test.eventpay.com/api/workers/stripe-connect-webhook",
        {
          method: "POST",
          headers: {
            "Upstash-Message-Id": "msg_test_no_sig",
            "Upstash-Retried": "0",
          },
          body: payload,
        }
      );

      const response = await ConnectWorkerPOST(request);
      const text = await response.text();

      expect(response.status).toBe(489);
      expect(response.headers.get("Upstash-NonRetryable-Error")).toBe("true");
      expect(text).toContain("Missing QStash signature");
    });

    test("既知 payout_profile の account.updated は同期処理で payout_profiles を更新する", async () => {
      process.env.SKIP_QSTASH_IN_TEST = "true";

      const testUser = await createTestUser(
        `connect-webhook-${Date.now()}@example.com`,
        "Password123!"
      );
      createdUsers.push(testUser);

      const fixture = await createOwnedCommunityFixture(testUser.id, {
        withPayoutProfile: true,
        payoutProfileStatus: "unverified",
        payoutsEnabled: false,
      });

      const adminClient = await createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "connect webhook pipeline integration verification"
      );

      await adminClient
        .from("payout_profiles")
        .update({
          stripe_account_id: "acct_fixture_webhook_123",
        })
        .eq("id", fixture.payoutProfileId!);

      const event = createMockAccountEvent({
        id: "acct_fixture_webhook_123",
        metadata: {},
        details_submitted: true,
        payouts_enabled: true,
        charges_enabled: true,
        capabilities: {
          transfers: "active",
          card_payments: "active",
        },
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: null,
        },
      });

      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_sync_update",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);
      expect(response.status).toBe(204);

      const { data: updatedProfile } = await adminClient
        .from("payout_profiles")
        .select("status, payouts_enabled")
        .eq("id", fixture.payoutProfileId!)
        .single();

      expect(updatedProfile?.status).toBe("verified");
      expect(updatedProfile?.payouts_enabled).toBe(true);
    });

    test("未知 stripe_account_id の account.updated は 204 で ACK skip する", async () => {
      process.env.SKIP_QSTASH_IN_TEST = "true";

      const event = createMockAccountEvent({
        id: "acct_unknown_123",
        metadata: {},
      });
      const payload = JSON.stringify(event);
      const validSignature = generateValidStripeSignature(payload, TEST_WEBHOOK_SECRET);

      const request = new NextRequest("https://test.eventpay.com/api/webhooks/stripe-connect", {
        method: "POST",
        headers: {
          "stripe-signature": validSignature,
          "x-request-id": "req_test_sync_unknown",
        },
        body: payload,
      });

      const response = await ConnectWebhookPOST(request);
      expect(response.status).toBe(204);
    });
  });

  describe("📋 設定・環境テスト", () => {
    test("必要な環境変数が設定されていることを確認", () => {
      expect(process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST).toBe(TEST_WEBHOOK_SECRET);
      expect(process.env.QSTASH_TOKEN).toBeDefined();
      expect(process.env.QSTASH_CURRENT_SIGNING_KEY).toBeDefined();
      expect(process.env.QSTASH_NEXT_SIGNING_KEY).toBeDefined();
    });

    test("IP制限がテスト環境で無効化されていることを確認", () => {
      expect(process.env.ENABLE_STRIPE_IP_CHECK).toBe("false");
    });
  });
});
