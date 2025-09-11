import { NextRequest } from "next/server";

import { POST as ConnectWebhookPOST } from "../../../app/api/webhooks/stripe-connect/route";

const mockPublishJSON = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Client: jest.fn().mockImplementation(() => ({
    publishJSON: mockPublishJSON,
  })),
}));

const mockVerifySignature = jest.fn();
jest.mock("@features/payments", () => ({
  StripeWebhookSignatureVerifier: jest.fn().mockImplementation(() => ({
    verifySignature: (...args: unknown[]) => mockVerifySignature(...args),
  })),
}));

describe("/api/webhooks/stripe-connect (receiver)", () => {
  beforeEach(() => {
    process.env.QSTASH_TOKEN = "test_qstash_token";
    process.env.NODE_ENV = "test";
    jest.clearAllMocks();
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
});
