import { NextRequest } from "next/server";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn<(...args: any[]) => Promise<boolean>>();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

const mockPaymentIntentRetrieve = jest.fn();
const mockChargeRetrieve = jest.fn();
const mockListApplicationFeeRefunds = jest.fn();

jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => ({
    paymentIntents: {
      retrieve: mockPaymentIntentRetrieve,
    },
    charges: {
      retrieve: mockChargeRetrieve,
    },
    applicationFees: {
      listRefunds: mockListApplicationFeeRefunds,
    },
  })),
}));

// ロガーをモック（Worker内のPOST関数がロードされる前に必要）
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn().mockReturnThis(),
  },
}));

import { POST as WorkerPOST } from "@/app/api/workers/stripe-webhook/route";

import {
  setupChargeRefundedTest,
  type ChargeRefundedTestSetup,
} from "./charge-refunded-test-setup";

function createRequest(body: unknown, headersInit?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/workers/stripe-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Message-Id": `msg_test_${Date.now()}`,
    "Upstash-Retried": "0",
    ...headersInit,
  });
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createApplicationFeeRefundedEvent(applicationFeeId: string): any {
  return {
    id: `evt_test_app_fee_refunded_${Date.now()}`,
    object: "event",
    type: "application_fee.refunded",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: applicationFeeId,
        object: "application_fee",
      },
    },
  };
}

describe("application_fee.refunded Webhook - auto-pagination", () => {
  let setup: ChargeRefundedTestSetup;

  beforeAll(async () => {
    setup = await setupChargeRefundedTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  beforeEach(() => {
    mockVerify.mockResolvedValue(true);
    mockPaymentIntentRetrieve.mockReset();
    mockChargeRetrieve.mockReset();
    mockListApplicationFeeRefunds.mockReset();
  });

  it("application fee refund が複数ページ相当でも全件合算される", async () => {
    const payment = await setup.createPaidPayment(setup.testAttendance.id, {
      amount: 1800,
      applicationFeeAmount: 180,
    });

    const applicationFeeId = `fee_test_${Date.now()}`;
    await setup.supabase
      .from("payments")
      .update({ application_fee_id: applicationFeeId })
      .eq("id", payment.id);

    const feeRefunds = [
      ...Array.from({ length: 100 }, (_, idx) => ({
        id: `fr_test_${idx + 1}`,
        object: "fee_refund",
        amount: 2,
        created: idx + 1,
      })),
      {
        id: "fr_test_101",
        object: "fee_refund",
        amount: 25,
        created: 101,
      },
    ];

    mockListApplicationFeeRefunds.mockReturnValue({
      autoPagingEach: async (onItem: (item: any) => unknown) => {
        for (const refund of feeRefunds) {
          await onItem(refund);
        }
      },
    });

    const event = createApplicationFeeRefundedEvent(applicationFeeId);
    const req = createRequest({ event });

    const res = await WorkerPOST(req);
    expect(res.status).toBe(204);

    const { data: updatedPayment } = await setup.supabase
      .from("payments")
      .select("application_fee_refunded_amount,application_fee_refund_id,webhook_event_id")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment.application_fee_refunded_amount).toBe(225);
    expect(updatedPayment.application_fee_refund_id).toBe("fr_test_101");
    expect(updatedPayment.webhook_event_id).toBe(event.id);
    expect(mockListApplicationFeeRefunds).toHaveBeenCalledWith(applicationFeeId, { limit: 100 });
  });
});
