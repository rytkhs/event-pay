import type Stripe from "stripe";

import * as errorHandler from "@core/utils/error-handler.server";
import { StripeWebhookEventHandler } from "@features/payments/services/webhook/webhook-event-handler";

describe("StripeWebhookEventHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("markSucceeded が失敗しても業務成功を維持して失敗応答にしない", async () => {
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
      markSucceeded: jest.fn().mockRejectedValue({
        message: "statement timeout",
        operation: "mark_succeeded",
        code: "57014",
      }),
      markFailed: jest.fn(),
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

    expect(result.success).toBe(true);
    expect(mockLedger.markSucceeded).toHaveBeenCalledWith(event.id);
    expect(mockLedger.markFailed).not.toHaveBeenCalled();
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
