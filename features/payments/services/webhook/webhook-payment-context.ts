import type Stripe from "stripe";

import type { WebhookContextLogger } from "./context/webhook-handler-context";
import type { PaymentWebhookRecord } from "./repositories/payment-webhook-repository";
import type { WebhookProcessingMeta } from "./types";

interface BuildPaymentWebhookMetaParams {
  eventId?: string;
  payment?: PaymentWebhookRecord | null;
  extra?: Partial<WebhookProcessingMeta>;
}

interface LogStripeAccountSnapshotMismatchParams {
  event: Stripe.Event;
  payment: PaymentWebhookRecord;
  logger: WebhookContextLogger;
}

function toOptionalString(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function buildPaymentWebhookMeta({
  eventId,
  payment,
  extra,
}: BuildPaymentWebhookMetaParams): WebhookProcessingMeta {
  return {
    eventId,
    paymentId: payment?.id,
    payoutProfileId: toOptionalString(payment?.payout_profile_id),
    stripeAccountId: toOptionalString(payment?.stripe_account_id),
    ...extra,
  };
}

export function getPaymentWebhookLogContext(payment: PaymentWebhookRecord) {
  return {
    payment_id: payment.id,
    payout_profile_id: toOptionalString(payment.payout_profile_id),
    stripe_account_id: toOptionalString(payment.stripe_account_id),
  };
}

export function logStripeAccountSnapshotMismatch({
  event,
  payment,
  logger,
}: LogStripeAccountSnapshotMismatchParams): void {
  const eventAccountId = toOptionalString(event.account);
  const snapshotAccountId = toOptionalString(payment.stripe_account_id);

  if (!eventAccountId || !snapshotAccountId || eventAccountId === snapshotAccountId) {
    return;
  }

  logger.warn("Stripe event account does not match payment snapshot", {
    event_id: event.id,
    event_type: event.type,
    payment_id: payment.id,
    payout_profile_id: toOptionalString(payment.payout_profile_id),
    stripe_account_id: snapshotAccountId,
    stripe_event_account_id: eventAccountId,
    outcome: "failure",
  });
}
