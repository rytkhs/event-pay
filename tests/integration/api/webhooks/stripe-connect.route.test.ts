import { NextRequest } from "next/server";

import { POST as ConnectWebhookPOST } from "../../../../app/api/webhooks/stripe-connect/route";

const mockPublishJSON = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Client: jest.fn().mockImplementation(() => ({
    publishJSON: mockPublishJSON,
  })),
}));

const mockVerifySignature = jest.fn();
jest.mock("@core/stripe/webhook-signature-verifier", () => ({
  StripeWebhookSignatureVerifier: jest.fn().mockImplementation(() => ({
    verifySignature: (...args: unknown[]) => mockVerifySignature(...args),
  })),
}));

const handleAccountUpdated = jest.fn();
const handleAccountApplicationDeauthorized = jest.fn();
const handlePayoutPaid = jest.fn();
const handlePayoutFailed = jest.fn();
const mockConnectHandlerCreate = jest.fn().mockResolvedValue({
  handleAccountUpdated: (...args: unknown[]) => handleAccountUpdated(...args),
  handleAccountApplicationDeauthorized: (...args: unknown[]) =>
    handleAccountApplicationDeauthorized(...args),
  handlePayoutPaid: (...args: unknown[]) => handlePayoutPaid(...args),
  handlePayoutFailed: (...args: unknown[]) => handlePayoutFailed(...args),
});

jest.mock("@features/stripe-connect/server", () => ({
  ConnectWebhookHandler: {
    create: (...args: unknown[]) => mockConnectHandlerCreate(...args),
  },
  registerStripeConnectAdapters: jest.fn(),
}));

describe("/api/webhooks/stripe-connect (receiver)", () => {
  beforeEach(() => {
    process.env.QSTASH_TOKEN = "test_qstash_token";
    process.env.NODE_ENV = "test";
    // QStashへのpublishをテストするため、SKIP_QSTASH_IN_TESTを未設定にする
    delete process.env.SKIP_QSTASH_IN_TEST;
    mockVerifySignature.mockClear();
    mockPublishJSON.mockClear();
    mockConnectHandlerCreate.mockClear();
    handleAccountUpdated.mockClear();
    handleAccountApplicationDeauthorized.mockClear();
    handlePayoutPaid.mockClear();
    handlePayoutFailed.mockClear();
  });

  afterEach(() => {
    delete process.env.SKIP_QSTASH_IN_TEST;
  });

  function createRequest(payload: string, headersInit?: Record<string, string>) {
    const url = new URL("http://localhost/api/webhooks/stripe-connect");
    const headers = new Headers(headersInit || {});
    return new NextRequest(url, {
      method: "POST",
      headers,
      body: payload,
    });
  }

  it("署名欠落で400 (MISSING_PARAMETER)", async () => {
    const req = createRequest(JSON.stringify({ any: "thing" }));
    const res = await ConnectWebhookPOST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("MISSING_PARAMETER");
  });

  describe("署名検証エラーケース", () => {
    it("署名不正で400 (INVALID_REQUEST)", async () => {
      mockVerifySignature.mockResolvedValueOnce({ isValid: false });
      const req = createRequest(JSON.stringify({ foo: "bar" }), {
        "stripe-signature": "t=123,v1=invalid",
      });
      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("署名形式が不正（タイムスタンプなし）で400エラー", async () => {
      mockVerifySignature.mockResolvedValueOnce({
        isValid: false,
        error: "Invalid signature format",
      });

      const req = createRequest(JSON.stringify({ connect: "event" }), {
        "stripe-signature": "v1=invalid_no_timestamp",
      });
      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("タイムスタンプ期限切れで400エラー", async () => {
      mockVerifySignature.mockResolvedValueOnce({
        isValid: false,
        error: "Request timestamp too old",
      });

      const req = createRequest(JSON.stringify({ account: "acct_test" }), {
        "stripe-signature": "t=1600000000,v1=expired_signature",
      });
      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("ペイロード改ざん検出で400エラー", async () => {
      mockVerifySignature.mockResolvedValueOnce({
        isValid: false,
        error: "Signature verification failed",
      });

      const req = createRequest(JSON.stringify({ tampered: "connect_data" }), {
        "stripe-signature": "t=1700000000,v1=original_signature",
      });
      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("不正なConnect Webhookシークレットで400エラー", async () => {
      mockVerifySignature.mockResolvedValueOnce({
        isValid: false,
        error: "No signatures found matching the expected signature",
      });

      const req = createRequest(JSON.stringify({ account: "acct_connect" }), {
        "stripe-signature": "t=1700000000,v1=wrong_connect_secret",
      });
      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("INVALID_REQUEST");
    });
  });

  describe("正常系テスト", () => {
    it("正常時にConnect Webhookが処理される", async () => {
      const fakeConnectEvent = {
        id: "evt_connect_123",
        type: "account.updated",
        object: "event",
        account: "acct_test_123",
        data: {
          object: {
            id: "acct_test_123",
            object: "account",
            metadata: {
              actor_id: "test_user_id",
            },
          } as any,
        },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: {
          id: null,
          idempotency_key: null,
        },
      } as any;
      mockVerifySignature.mockResolvedValueOnce({
        isValid: true,
        event: fakeConnectEvent,
      });
      mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_connect_123" });

      const req = createRequest(JSON.stringify({ account: "acct_test_123" }), {
        "stripe-signature": "t=1700000000,v1=valid_connect_signature",
      });

      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("X-Event-Id")).toBe(fakeConnectEvent.id);
      expect(res.headers.get("X-Event-Type")).toBe(fakeConnectEvent.type);
      expect(res.headers.get("X-QStash-Message-Id")).toBe("msg_connect_123");

      // publishJSON の引数検証
      expect(mockPublishJSON).toHaveBeenCalledTimes(1);
      const call = mockPublishJSON.mock.calls[0][0];
      expect(call.url).toContain("/api/workers/stripe-connect-webhook");
      expect(call.deduplicationId).toBe(fakeConnectEvent.id);
      expect(call.body).toEqual({ event: fakeConnectEvent });
    });

    it("SKIP_QSTASH_IN_TEST=true の場合は同期処理される", async () => {
      process.env.SKIP_QSTASH_IN_TEST = "true";

      const fakeConnectEvent = {
        id: "evt_connect_sync_123",
        type: "account.updated",
        object: "event",
        account: "acct_test_sync_123",
        data: {
          object: {
            id: "acct_test_sync_123",
            object: "account",
            metadata: {
              actor_id: "test_user_id",
            },
          } as any,
        },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: {
          id: null,
          idempotency_key: null,
        },
      } as any;

      mockVerifySignature.mockResolvedValueOnce({
        isValid: true,
        event: fakeConnectEvent,
      });

      const req = createRequest(JSON.stringify({ account: "acct_test_sync_123" }), {
        "stripe-signature": "t=1700000000,v1=valid_connect_signature",
      });

      const res = await ConnectWebhookPOST(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("X-Event-Id")).toBe(fakeConnectEvent.id);
      expect(res.headers.get("X-Event-Type")).toBe(fakeConnectEvent.type);
      expect(res.headers.get("X-Test-Mode")).toBe("true");

      expect(mockPublishJSON).not.toHaveBeenCalled();
      expect(mockConnectHandlerCreate).toHaveBeenCalledTimes(1);
      expect(handleAccountUpdated).toHaveBeenCalledTimes(1);
    });
  });
});
