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

// Stripe mock
const mockPaymentIntentRetrieve = jest.fn();
const mockChargeRetrieve = jest.fn();
jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => ({
    paymentIntents: {
      retrieve: mockPaymentIntentRetrieve,
    },
    charges: {
      retrieve: mockChargeRetrieve,
    },
  })),
}));

function createRequest(body: unknown, headersInit?: Record<string, string>) {
  const url = new URL("http://localhost/api/workers/stripe-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Message-Id": "msg_test_456",
    "Upstash-Retried": "0",
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
    mockPaymentIntentRetrieve.mockReset();
    mockChargeRetrieve.mockReset();
  });

  it("checkout.session.expired は 204 を返す（failed 昇格パスを実行）", async () => {
    const evt = {
      ...webhookEventFixtures.checkoutCompleted(),
      type: "checkout.session.expired",
    } as any;
    const req = createRequest({ event: evt });
    const res = await WorkerPOST(req);
    expect(res.status).toBe(204);
  });

  it("charge.succeeded/failed/refunded の最小パスが204を返す", async () => {
    for (const type of ["charge.succeeded", "charge.failed", "charge.refunded"]) {
      const evt = {
        ...webhookEventFixtures.paymentIntentSucceeded(),
        type,
        data: {
          object: {
            id: "ch_test_123",
            payment_intent: "pi_test_completed",
            amount_refunded: type === "charge.refunded" ? 100 : 0,
            metadata: { payment_id: "eb568676-e91d-444a-8f92-5eb3065a7f92" },
          },
        },
      } as any;
      if (type === "charge.succeeded") {
        mockPaymentIntentRetrieve.mockResolvedValue({
          id: "pi_test_completed",
          latest_charge: {
            id: "ch_test_123",
            balance_transaction: { id: "txn_test", fee: 100, net: 1400 },
            transfer: "tr_test",
            application_fee: "fee_test",
          },
        });
      }

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);
      expect(res.status).toBe(204);
    }
  });
});
