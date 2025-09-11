import { NextRequest } from "next/server";

import { POST as StripeWebhookPOST } from "../../../app/api/webhooks/stripe/route";

const mockPublishJSON = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Client: jest.fn().mockImplementation(() => ({
    publishJSON: mockPublishJSON,
  })),
}));

const mockVerifySignature = jest.fn();
jest.mock("@features/payments/services/webhook/webhook-signature-verifier", () => ({
  StripeWebhookSignatureVerifier: jest.fn().mockImplementation(() => ({
    verifySignature: (...args: unknown[]) => mockVerifySignature(...args),
  })),
}));

describe("/api/webhooks/stripe (receiver)", () => {
  beforeEach(() => {
    process.env.QSTASH_TOKEN = "test_qstash_token";
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
  });

  function createRequest(payload: string, headersInit?: Record<string, string>) {
    const url = new URL("http://localhost/api/webhooks/stripe");
    const headers = new Headers(headersInit || {});
    return new NextRequest(url, {
      method: "POST",
      headers,
      body: payload,
    });
  }

  it("署名欠落で400 (INVALID_REQUEST)", async () => {
    const req = createRequest(JSON.stringify({ any: "thing" }));
    const res = await StripeWebhookPOST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INVALID_REQUEST");
  });

  it("署名不正で400 (INVALID_REQUEST)", async () => {
    mockVerifySignature.mockResolvedValueOnce({ isValid: false });

    const req = createRequest(JSON.stringify({ foo: "bar" }), {
      "stripe-signature": "t=123,v1=invalid",
    });
    const res = await StripeWebhookPOST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INVALID_REQUEST");
  });

  it("正常時にQStashへpublishされ200を返す", async () => {
    const fakeEvent = { id: "evt_test_123", type: "payment_intent.succeeded" };
    mockVerifySignature.mockResolvedValueOnce({ isValid: true, event: fakeEvent });
    mockPublishJSON.mockResolvedValueOnce({ messageId: "msg_test_123" });

    const req = createRequest(JSON.stringify({ payload: true }), {
      "stripe-signature": "t=1700000000,v1=dummy",
      "x-request-id": "req_test_abc",
    });

    const res = await StripeWebhookPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({
        received: true,
        eventId: fakeEvent.id,
        eventType: fakeEvent.type,
        qstashMessageId: "msg_test_123",
      })
    );

    // publishJSON の引数検証
    expect(mockPublishJSON).toHaveBeenCalledTimes(1);
    const call = mockPublishJSON.mock.calls[0][0];
    expect(call.url).toContain("/api/workers/stripe-webhook");
    expect(call.deduplicationId).toBe(fakeEvent.id);
    expect(call.body).toEqual({ event: fakeEvent });
  });
});
