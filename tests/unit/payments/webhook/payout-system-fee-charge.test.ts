import type Stripe from "stripe";

import { ChargeHandler } from "@/features/payments/services/webhook/handlers/charge-handler";
import { RefundHandler } from "@/features/payments/services/webhook/handlers/refund-handler";
import { handleServerError } from "@core/utils/error-handler.server";

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: jest.fn(),
}));

describe("payout request system fee charge webhook", () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const mockPaymentRepository = {
    resolveByChargeOrFallback: jest.fn(),
  };
  const mockStripeObjectFetchService = {
    getChargeSnapshotForChargeSucceeded: jest.fn(),
    retrieveChargeForRefundAggregation: jest.fn(),
  };
  const mockPaymentNotificationService = {
    sendPaymentCompletedNotification: jest.fn(),
  };

  const createChargeEvent = (type: string, purpose = "payout_request_system_fee"): Stripe.Event =>
    ({
      id: `evt_${type}`,
      type,
      data: {
        object: {
          id: "py_system_fee_123",
          object: "charge",
          metadata: {
            purpose,
            payout_request_id: "payout-request-123",
          },
        },
      },
    }) as unknown as Stripe.Event;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("charge.succeededを通常決済として処理しない", async () => {
    const handler = new ChargeHandler({
      paymentRepository: mockPaymentRepository as never,
      stripeObjectFetchService: mockStripeObjectFetchService as never,
      paymentNotificationService: mockPaymentNotificationService as never,
      logger: mockLogger as never,
    });

    const result = await handler.handleSucceeded(
      createChargeEvent("charge.succeeded") as Stripe.ChargeSucceededEvent
    );

    expect(result.success).toBe(true);
    expect(mockStripeObjectFetchService.getChargeSnapshotForChargeSucceeded).not.toHaveBeenCalled();
    expect(mockPaymentRepository.resolveByChargeOrFallback).not.toHaveBeenCalled();
    expect(mockPaymentNotificationService.sendPaymentCompletedNotification).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Payout request system fee charge skipped by payment webhook",
      expect.objectContaining({
        event_type: "charge.succeeded",
        charge_id: "py_system_fee_123",
        payout_request_id: "payout-request-123",
        outcome: "success",
      })
    );
  });

  it("charge.failedを通常決済として処理しない", async () => {
    const handler = new ChargeHandler({
      paymentRepository: mockPaymentRepository as never,
      stripeObjectFetchService: mockStripeObjectFetchService as never,
      paymentNotificationService: mockPaymentNotificationService as never,
      logger: mockLogger as never,
    });

    const result = await handler.handleFailed(
      createChargeEvent("charge.failed") as Stripe.ChargeFailedEvent
    );

    expect(result.success).toBe(true);
    expect(mockPaymentRepository.resolveByChargeOrFallback).not.toHaveBeenCalled();
  });

  it("charge.refundedを通常決済として処理しない", async () => {
    const handler = new RefundHandler({
      paymentRepository: mockPaymentRepository as never,
      stripeObjectFetchService: mockStripeObjectFetchService as never,
      logger: mockLogger as never,
    });

    const result = await handler.handleChargeRefunded(
      createChargeEvent("charge.refunded") as Stripe.ChargeRefundedEvent
    );

    expect(result.success).toBe(true);
    expect(mockPaymentRepository.resolveByChargeOrFallback).not.toHaveBeenCalled();
    expect(mockStripeObjectFetchService.retrieveChargeForRefundAggregation).not.toHaveBeenCalled();
  });

  it("通常Chargeが見つからない場合は未検出エラーを維持する", async () => {
    mockPaymentRepository.resolveByChargeOrFallback.mockResolvedValue(null);
    const handler = new ChargeHandler({
      paymentRepository: mockPaymentRepository as never,
      stripeObjectFetchService: mockStripeObjectFetchService as never,
      paymentNotificationService: mockPaymentNotificationService as never,
      logger: mockLogger as never,
    });

    const result = await handler.handleFailed(
      createChargeEvent("charge.failed", "event_payment") as Stripe.ChargeFailedEvent
    );

    expect(result.success).toBe(true);
    expect(mockPaymentRepository.resolveByChargeOrFallback).toHaveBeenCalledTimes(1);
    expect(handleServerError).toHaveBeenCalledWith(
      "WEBHOOK_PAYMENT_NOT_FOUND",
      expect.objectContaining({ action: "handleChargeFailed" })
    );
  });
});
