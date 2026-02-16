import type Stripe from "stripe";

import { StripeObjectFetchService } from "../../../../features/payments/services/webhook/services/stripe-object-fetch-service";

const mockWarn = jest.fn();
const mockDebug = jest.fn();
const mockInfo = jest.fn();

const mockPaymentIntentRetrieve = jest.fn();
const mockChargeRetrieve = jest.fn();
const mockListApplicationFeeRefunds = jest.fn();

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    withContext: jest.fn(() => ({
      warn: mockWarn,
      debug: mockDebug,
      info: mockInfo,
    })),
  },
}));

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

describe("StripeObjectFetchService", () => {
  const service = new StripeObjectFetchService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("latest_charge が event charge と一致する場合は payment_intent snapshot を採用する", async () => {
    const eventCharge = { id: "ch_evt_1" } as Stripe.Charge;
    const latestCharge = { id: "ch_evt_1", object: "charge" } as Stripe.Charge;

    mockPaymentIntentRetrieve.mockResolvedValue({
      id: "pi_1",
      latest_charge: latestCharge,
    } as Stripe.PaymentIntent);

    const result = await service.getChargeSnapshotForChargeSucceeded({
      charge: eventCharge,
      stripePaymentIntentId: "pi_1",
    });

    expect(mockPaymentIntentRetrieve).toHaveBeenCalledWith("pi_1", {
      expand: ["latest_charge.balance_transaction", "latest_charge.transfer"],
    });
    expect(mockChargeRetrieve).not.toHaveBeenCalled();
    expect(result.charge.id).toBe("ch_evt_1");
    expect(result.source).toBe("payment_intent_latest_charge");
  });

  it("latest_charge が event charge と不一致の場合は charge retrieve にフォールバックする", async () => {
    const eventCharge = { id: "ch_evt_2" } as Stripe.Charge;
    const mismatchedLatestCharge = { id: "ch_other", object: "charge" } as Stripe.Charge;

    mockPaymentIntentRetrieve.mockResolvedValue({
      id: "pi_2",
      latest_charge: mismatchedLatestCharge,
    } as Stripe.PaymentIntent);
    mockChargeRetrieve.mockResolvedValue({ id: "ch_evt_2", object: "charge" } as Stripe.Charge);

    const result = await service.getChargeSnapshotForChargeSucceeded({
      charge: eventCharge,
      stripePaymentIntentId: "pi_2",
    });

    expect(mockChargeRetrieve).toHaveBeenCalledWith("ch_evt_2", {
      expand: ["balance_transaction", "transfer"],
    });
    expect(result.charge.id).toBe("ch_evt_2");
    expect(result.source).toBe("charge_retrieve");
    expect(mockWarn).toHaveBeenCalledWith(
      "Payment intent latest_charge does not match event charge; fallback to charge retrieve",
      expect.objectContaining({
        payment_intent_id: "pi_2",
        event_charge_id: "ch_evt_2",
        latest_charge_id: "ch_other",
      })
    );
  });

  it("payment_intent.retrieve 失敗時も charge retrieve で継続する", async () => {
    const eventCharge = { id: "ch_evt_3" } as Stripe.Charge;
    mockPaymentIntentRetrieve.mockRejectedValue(new Error("pi failed"));
    mockChargeRetrieve.mockResolvedValue({ id: "ch_evt_3", object: "charge" } as Stripe.Charge);

    const result = await service.getChargeSnapshotForChargeSucceeded({
      charge: eventCharge,
      stripePaymentIntentId: "pi_3",
    });

    expect(result.charge.id).toBe("ch_evt_3");
    expect(result.source).toBe("charge_retrieve");
    expect(mockChargeRetrieve).toHaveBeenCalledTimes(1);
  });

  it("application fee refunds は auto-pagination で全件集計する", async () => {
    const refunds = [
      ...Array.from({ length: 100 }, (_, idx) => ({
        id: `fr_${idx + 1}`,
        amount: 10,
        created: idx + 1,
        object: "fee_refund",
      })),
      { id: "fr_101", amount: 25, created: 101, object: "fee_refund" },
    ] as Stripe.FeeRefund[];

    const mockAutoPagingEach = jest.fn(async (onItem: (item: Stripe.FeeRefund) => unknown) => {
      for (const refund of refunds) {
        await onItem(refund);
      }
    });

    mockListApplicationFeeRefunds.mockReturnValue({
      autoPagingEach: mockAutoPagingEach,
    });

    const result = await service.sumApplicationFeeRefunds("fee_1");

    expect(result.amount).toBe(1025);
    expect(result.latestRefundId).toBe("fr_101");
    expect(mockListApplicationFeeRefunds).toHaveBeenCalledTimes(1);
    expect(mockListApplicationFeeRefunds).toHaveBeenCalledWith("fee_1", {
      limit: 100,
    });
    expect(mockAutoPagingEach).toHaveBeenCalledTimes(1);
  });
});
