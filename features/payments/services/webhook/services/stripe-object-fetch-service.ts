import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";
import { getStripe } from "@core/stripe/client";

export type ChargeSnapshotSource = "payment_intent_latest_charge" | "charge_retrieve";

export interface ChargeSnapshot {
  charge: Stripe.Charge;
  paymentIntent?: Stripe.PaymentIntent;
  source: ChargeSnapshotSource;
}

export const STRIPE_OBJECT_FETCH_POLICY = {
  trustWebhookPayload: [
    "event.id",
    "event.type",
    "charge.id",
    "payment_intent.id",
    "amount_refunded",
    "metadata.payment_id",
  ],
  alwaysRetrieveFromStripe: [
    "balance_transaction",
    "transfer",
    "application_fee",
    "application_fee refund aggregate",
  ],
} as const;

export class StripeObjectFetchService {
  private readonly logger = logger.withContext({
    category: "stripe_webhook",
    action: "stripe_object_fetch_service",
    actor_type: "webhook",
  });

  async getChargeSnapshotForChargeSucceeded(params: {
    charge: Stripe.Charge;
    stripePaymentIntentId: string | null;
  }): Promise<ChargeSnapshot> {
    const { charge, stripePaymentIntentId } = params;
    const eventChargeId = charge.id;
    let paymentIntentRetrieveError: Error | null = null;

    if (stripePaymentIntentId) {
      try {
        const paymentIntent = await getStripe().paymentIntents.retrieve(stripePaymentIntentId, {
          expand: ["latest_charge.balance_transaction", "latest_charge.transfer"],
        });

        const latestCharge = paymentIntent.latest_charge;
        if (latestCharge && typeof latestCharge === "object" && latestCharge.id === eventChargeId) {
          return {
            paymentIntent,
            charge: latestCharge,
            source: "payment_intent_latest_charge",
          };
        }
        if (latestCharge && typeof latestCharge === "object" && latestCharge.id !== eventChargeId) {
          this.logger.warn(
            "Payment intent latest_charge does not match event charge; fallback to charge retrieve",
            {
              payment_intent_id: stripePaymentIntentId,
              event_charge_id: eventChargeId,
              latest_charge_id: latestCharge.id,
              outcome: "failure",
            }
          );
        } else {
          this.logger.warn(
            "Payment intent retrieved without expanded latest_charge; fallback to charge retrieve",
            {
              payment_intent_id: stripePaymentIntentId,
              event_charge_id: eventChargeId,
              outcome: "failure",
            }
          );
        }
      } catch (error) {
        paymentIntentRetrieveError =
          error instanceof Error ? error : new Error("Unknown payment intent retrieve error");
        this.logger.warn("Failed to retrieve payment intent snapshot", {
          payment_intent_id: stripePaymentIntentId,
          event_charge_id: eventChargeId,
          error_message: paymentIntentRetrieveError.message,
          outcome: "failure",
        });
      }
    }

    try {
      const retrievedCharge = await getStripe().charges.retrieve(eventChargeId, {
        expand: ["balance_transaction", "transfer"],
      });
      return { charge: retrievedCharge, source: "charge_retrieve" };
    } catch (error) {
      const chargeRetrieveError =
        error instanceof Error ? error : new Error("Unknown charge retrieve error");
      this.logger.warn("Failed to retrieve charge snapshot", {
        event_charge_id: eventChargeId,
        payment_intent_id: stripePaymentIntentId ?? undefined,
        error_message: chargeRetrieveError.message,
        outcome: "failure",
      });
      throw new Error(
        `Failed to retrieve Stripe charge snapshot: ${chargeRetrieveError.message}${
          paymentIntentRetrieveError
            ? `; payment_intent_retrieve_error=${paymentIntentRetrieveError.message}`
            : ""
        }`
      );
    }
  }

  async retrieveChargeForRefundAggregation(chargeId: string): Promise<Stripe.Charge> {
    return getStripe().charges.retrieve(chargeId);
  }

  async listAllApplicationFeeRefunds(applicationFeeId: string): Promise<Stripe.FeeRefund[]> {
    const stripe = getStripe();
    const refunds: Stripe.FeeRefund[] = [];
    const list = stripe.applicationFees.listRefunds(applicationFeeId, {
      limit: 100,
    });

    await list.autoPagingEach(async (refund) => {
      refunds.push(refund);
    });

    return refunds;
  }

  async sumApplicationFeeRefunds(applicationFeeId: string): Promise<{
    amount: number;
    latestRefundId: string | null;
  }> {
    const refunds = await this.listAllApplicationFeeRefunds(applicationFeeId);

    const amount = refunds.reduce((sum, refund) => sum + (refund.amount ?? 0), 0);
    const latestRefund = refunds.reduce<Stripe.FeeRefund | null>((currentLatest, refund) => {
      if (!currentLatest) {
        return refund;
      }
      const latestCreated = currentLatest.created ?? 0;
      const currentCreated = refund.created ?? 0;
      if (currentCreated > latestCreated) {
        return refund;
      }
      if (currentCreated === latestCreated && refund.id > currentLatest.id) {
        return refund;
      }
      return currentLatest;
    }, null);
    const latestRefundId = latestRefund?.id ?? null;

    return {
      amount,
      latestRefundId,
    };
  }
}
