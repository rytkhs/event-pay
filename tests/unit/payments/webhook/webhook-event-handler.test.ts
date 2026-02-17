import type Stripe from "stripe";

import * as errorHandler from "@core/utils/error-handler.server";

import { StripeWebhookEventHandler } from "@features/payments/services/webhook/webhook-event-handler";

describe("StripeWebhookEventHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("markSucceeded が失敗したら retryable failure を返し ledger を failed に更新する", async () => {
    const handleServerErrorSpy = jest
      .spyOn(errorHandler, "handleServerError")
      .mockImplementation(() => undefined);

    const mockLedger = {
      beginProcessing: jest.fn().mockResolvedValue({
        action: "process",
        dedupeKey: "transfer.created:tr_test",
        stripeObjectId: null,
        status: "processing",
      }),
      markSucceeded: jest.fn().mockRejectedValue(new Error("statement timeout")),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };

    const handler = new StripeWebhookEventHandler() as any;
    handler.supabase = {};
    handler.runtime = {
      eventLedgerRepository: mockLedger,
      routerHandlers: {},
    };

    const event = {
      id: "evt_mark_succeeded_failure",
      type: "transfer.created",
      data: {
        object: {
          id: "tr_test",
        },
      },
    } as Stripe.Event;

    const result = await handler.handleEvent(event);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("WEBHOOK_UNEXPECTED_ERROR");
      expect(result.error.retryable).toBe(true);
    }
    expect(mockLedger.markSucceeded).toHaveBeenCalledWith(event.id);
    expect(mockLedger.markFailed).toHaveBeenCalledWith(
      event.id,
      expect.objectContaining({
        errorCode: "WEBHOOK_UNEXPECTED_ERROR",
        reason: "mark_succeeded_failed",
        terminal: false,
      })
    );
    expect(handleServerErrorSpy).toHaveBeenCalledWith(
      "WEBHOOK_UNEXPECTED_ERROR",
      expect.objectContaining({
        action: "handleEvent.markSucceeded",
        additionalData: expect.objectContaining({
          eventId: event.id,
          eventType: event.type,
        }),
      })
    );
  });
});
