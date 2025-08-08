import { NextRequest } from "next/server";
import Stripe from "stripe";
import { POST } from "@/app/api/webhooks/stripe/route";

// テスト用のStripeクライアント（バージョン固定は不要）
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_fake");

// 実際のWebhookペイロードを生成するヘルパー
function createWebhookPayload(event: any): string {
  return JSON.stringify(event);
}

// 実際のStripe署名を生成するヘルパー（テスト用にtimestampを指定可能）
function createStripeSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: ts,
  });
  return signature;
}

describe("Webhook Processing Integration", () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";

  beforeEach(() => {
    // 環境変数の設定
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_role_key";
  });

  it("payment_intent.succeeded Webhookの完全な処理フロー", async () => {
    const mockEvent = {
      id: "evt_test_payment_succeeded",
      type: "payment_intent.succeeded",
      api_version: "2024-06-20",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "pi_test_123456789",
          object: "payment_intent",
          amount: 1000,
          currency: "jpy",
          status: "succeeded",
          metadata: {
            attendance_id: "att_test_123",
          },
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: "req_test_123",
        idempotency_key: null,
      },
    };

    const payload = createWebhookPayload(mockEvent);
    const signature = createStripeSignature(payload, webhookSecret);

    // リクエストの作成
    const request = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": signature,
        "stripe-timestamp": Math.floor(Date.now() / 1000).toString(),
        "content-type": "application/json",
        "user-agent": "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
      },
    });

    // Webhookの処理
    const response = await POST(request);
    const responseData = await response.json();

    // レスポンスの検証
    expect(response.status).toBe(200);
    expect(responseData).toMatchObject({
      received: true,
      eventId: "evt_test_payment_succeeded",
      eventType: "payment_intent.succeeded",
    });
  }, 10000); // 10秒のタイムアウト

  it("payment_intent.payment_failed Webhookの処理フロー", async () => {
    const mockEvent = {
      id: "evt_test_payment_failed",
      type: "payment_intent.payment_failed",
      api_version: "2024-06-20",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "pi_test_failed_123",
          object: "payment_intent",
          amount: 1000,
          currency: "jpy",
          status: "requires_payment_method",
          last_payment_error: {
            code: "card_declined",
            message: "Your card was declined.",
            type: "card_error",
          },
          metadata: {
            attendance_id: "att_test_456",
          },
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: "req_test_456",
        idempotency_key: null,
      },
    };

    const payload = createWebhookPayload(mockEvent);
    const signature = createStripeSignature(payload, webhookSecret);

    const request = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": signature,
        "stripe-timestamp": Math.floor(Date.now() / 1000).toString(),
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData).toMatchObject({
      received: true,
      eventId: "evt_test_payment_failed",
      eventType: "payment_intent.payment_failed",
    });
  });

  it("重複Webhookイベントの冪等性テスト", async () => {
    const mockEvent = {
      id: "evt_test_duplicate",
      type: "payment_intent.succeeded",
      api_version: "2024-06-20",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "pi_test_duplicate",
          object: "payment_intent",
          amount: 1500,
          currency: "jpy",
          status: "succeeded",
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: "req_test_duplicate",
        idempotency_key: null,
      },
    };

    const payload = createWebhookPayload(mockEvent);
    const signature = createStripeSignature(payload, webhookSecret);

    const createRequest = () =>
      new NextRequest("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        body: payload,
        headers: {
          "stripe-signature": signature,
          "stripe-timestamp": Math.floor(Date.now() / 1000).toString(),
          "content-type": "application/json",
        },
      });

    // 最初の処理
    const firstResponse = await POST(createRequest());
    const firstResponseData = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstResponseData.wasAlreadyProcessed).toBe(false);

    // 重複処理
    const secondResponse = await POST(createRequest());
    const secondResponseData = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondResponseData.wasAlreadyProcessed).toBe(true);
    expect(secondResponseData.eventId).toBe("evt_test_duplicate");
  });

  it("無効な署名でのWebhook拒否テスト", async () => {
    const mockEvent = {
      id: "evt_test_invalid_signature",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_invalid" } },
    };

    const payload = createWebhookPayload(mockEvent);
    const invalidSignature = "v1=invalid_signature_here"; // t= を欠落させる

    const request = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": invalidSignature,
        "stripe-timestamp": Math.floor(Date.now() / 1000).toString(),
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const responseData = await response.json();

    expect(response.status).toBe(400);
    expect(responseData.error).toBe("Invalid webhook signature");
  });

  it("古いタイムスタンプでのWebhook拒否テスト", async () => {
    const mockEvent = {
      id: "evt_test_old_timestamp",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_old" } },
    };

    const payload = createWebhookPayload(mockEvent);
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6分40秒前
    const signature = createStripeSignature(payload, webhookSecret, oldTimestamp);

    const request = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": signature,
        // 実装は Stripe-Signature の t= を参照するため、別ヘッダは不要
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const responseData = await response.json();

    expect(response.status).toBe(400);
    expect(responseData.error).toBe("Invalid webhook signature");
  });

  it("サポートされていないイベントタイプの処理", async () => {
    const mockEvent = {
      id: "evt_test_unsupported",
      type: "customer.created", // サポートされていないイベント
      api_version: "2024-06-20",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cus_test_123",
          object: "customer",
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: "req_test_unsupported",
        idempotency_key: null,
      },
    };

    const payload = createWebhookPayload(mockEvent);
    const signature = createStripeSignature(payload, webhookSecret);

    const request = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": signature,
        "stripe-timestamp": Math.floor(Date.now() / 1000).toString(),
        "content-type": "application/json",
      },
    });

    const response = await POST(request);
    const responseData = await response.json();

    // サポートされていないイベントも成功として処理される
    expect(response.status).toBe(200);
    expect(responseData).toMatchObject({
      received: true,
      eventId: "evt_test_unsupported",
      eventType: "customer.created",
    });
  });
});
