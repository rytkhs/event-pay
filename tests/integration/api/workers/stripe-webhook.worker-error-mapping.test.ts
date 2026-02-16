import { NextRequest } from "next/server";

const mockVerify = jest.fn();
const mockHandleEvent = jest.fn();

jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

jest.mock("@features/payments/server", () => {
  const actual = jest.requireActual("@features/payments/server");
  return {
    ...actual,
    StripeWebhookEventHandler: jest.fn().mockImplementation(() => ({
      handleEvent: (...args: unknown[]) => mockHandleEvent(...args),
    })),
  };
});

import { POST as WorkerPOST } from "@/app/api/workers/stripe-webhook/route";

function createRequest(eventId: string): NextRequest {
  const url = new URL("http://localhost/api/workers/stripe-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Message-Id": `msg_${eventId}`,
    "Upstash-Retried": "0",
  });

  const body = {
    event: {
      id: eventId,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi_${eventId}`,
          object: "payment_intent",
        },
      },
    },
  };

  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("/api/workers/stripe-webhook error mapping", () => {
  beforeEach(() => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";
    mockVerify.mockResolvedValue(true);
    mockHandleEvent.mockReset();
  });

  it("terminal failure は 489 + NonRetryable header を返す", async () => {
    mockHandleEvent.mockResolvedValue({
      success: false,
      error: {
        code: "WEBHOOK_UNEXPECTED_ERROR",
        message: "cardinality violation",
        userMessage: "cardinality violation",
        retryable: false,
        details: {},
      },
      meta: {
        terminal: true,
        reason: "payment_repository_findByStripeChargeId_cardinality_failed",
      },
    });

    const res = await WorkerPOST(createRequest("evt_terminal"));

    expect(res.status).toBe(489);
    expect(res.headers.get("Upstash-NonRetryable-Error")).toBe("true");
  });

  it("retryable failure は 500 を返す", async () => {
    mockHandleEvent.mockResolvedValue({
      success: false,
      error: {
        code: "WEBHOOK_UNEXPECTED_ERROR",
        message: "temporary timeout",
        userMessage: "temporary timeout",
        retryable: true,
        details: {},
      },
      meta: {
        terminal: false,
        reason: "payment_repository_findById_transient_failed",
      },
    });

    const res = await WorkerPOST(createRequest("evt_retryable"));

    expect(res.status).toBe(500);
    expect(res.headers.get("Upstash-NonRetryable-Error")).toBeNull();
  });
});
