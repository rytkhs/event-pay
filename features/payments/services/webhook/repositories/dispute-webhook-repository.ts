import Stripe from "stripe";

import type { PaymentDisputeInsert } from "@core/types/payment";
import type { AppSupabaseClient } from "@core/types/supabase";

interface UpsertDisputeRecordParams {
  dispute: Stripe.Dispute;
  paymentId: string | null;
  chargeId: string | null;
  paymentIntentId: string | null;
  eventType: string;
  stripeAccountId: string | null | undefined;
}

interface DisputeWebhookRepositoryError {
  message: string;
  code?: string | null;
}

interface UpsertDisputeRecordResult {
  error: DisputeWebhookRepositoryError | null;
}

export class DisputeWebhookRepository {
  constructor(private readonly supabase: AppSupabaseClient) {}

  async upsertDisputeRecord(params: UpsertDisputeRecordParams): Promise<UpsertDisputeRecordResult> {
    const { dispute, paymentId, chargeId, paymentIntentId, eventType, stripeAccountId } = params;
    const evidenceDueByUnix = dispute.evidence_details?.due_by ?? null;
    const now = new Date().toISOString();

    const disputeUpsert: PaymentDisputeInsert = {
      payment_id: paymentId,
      stripe_dispute_id: dispute.id,
      charge_id: chargeId,
      payment_intent_id: paymentIntentId,
      amount: dispute.amount ?? 0,
      currency: (dispute.currency || "jpy").toLowerCase(),
      reason: dispute.reason ?? null,
      status: dispute.status || "needs_response",
      evidence_due_by: evidenceDueByUnix ? new Date(evidenceDueByUnix * 1000).toISOString() : null,
      stripe_account_id: stripeAccountId ?? null,
      updated_at: now,
    };

    // Only set closed_at for charge.dispute.closed events to preserve existing value
    if (eventType === "charge.dispute.closed") {
      disputeUpsert.closed_at = now;
    }

    const { error } = await this.supabase
      .from("payment_disputes")
      .upsert([disputeUpsert], { onConflict: "stripe_dispute_id" });

    if (!error) {
      return { error: null };
    }

    return {
      error: {
        message: error.message,
        code: error.code,
      },
    };
  }
}
