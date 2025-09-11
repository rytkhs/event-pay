import { NextRequest } from "next/server";

import { POST as WorkerPOST } from "@/app/api/workers/stripe-webhook/route";
import { webhookEventFixtures } from "@/tests/fixtures/payment-test-fixtures";

// QStash verify mock
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

function createRequest(body: unknown, headersInit?: Record<string, string>) {
  const url = new URL("http://localhost/api/workers/stripe-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Delivery-Id": "deliv_test_456",
    ...headersInit,
  });
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("/api/workers/stripe-webhook (expired & charge)", () => {
  beforeEach(() => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";
    mockVerify.mockResolvedValue(true);
  });

  it("checkout.session.expired は 200 を返す（failed 昇格パスを実行）", async () => {
    const evt = {
      ...webhookEventFixtures.checkoutCompleted(),
      type: "checkout.session.expired",
    } as any;
    const req = createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(200);
  });

  it("charge.succeeded/failed/refunded の最小パスが200を返す", async () => {
    for (const type of ["charge.succeeded", "charge.failed", "charge.refunded"]) {
      const evt = {
        ...webhookEventFixtures.paymentIntentSucceeded(),
        type,
        data: {
          object: {
            id: "ch_test_123",
            payment_intent: "pi_test_completed",
            amount_refunded: type === "charge.refunded" ? 100 : 0,
            metadata: { payment_id: "pay_test_pending" },
          },
        },
      } as any;
      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);
      expect(res.status).toBe(200);
    }
  });
});
