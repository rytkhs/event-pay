import type { PaymentRow, PaymentUpdate, PaymentWebhookMetaJson } from "@core/types/payment";
import type { PaymentStatus } from "@core/types/statuses";
import type { AppSupabaseClient } from "@core/types/supabase";

interface ResolveByPaymentIntentOrMetadataParams {
  paymentIntentId: string | null;
  metadataPaymentId: string | null;
}

interface ResolveByChargeOrFallbackParams {
  paymentIntentId: string | null;
  chargeId: string;
  metadataPaymentId: string | null;
}

interface ResolveCheckoutTargetParams {
  checkoutSessionId: string;
  metadataPaymentId: string | null;
}

interface ResolveForDisputeParams {
  paymentIntentId: string | null;
  chargeId: string | null;
}

interface SaveCheckoutSessionLinkParams {
  paymentId: string;
  sessionId: string;
  paymentIntentId: string | null;
}

interface UpdateStatusPaidFromPaymentIntentParams {
  paymentId: string;
  eventId: string;
  stripePaymentIntentId: string;
}

interface UpdateStatusFailedFromPaymentIntentParams {
  paymentId: string;
  eventId: string;
  stripePaymentIntentId: string;
}

interface UpdateStatusFailedFromCheckoutSessionParams {
  paymentId: string;
  eventId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
}

interface UpdateStatusPaidFromChargeSnapshotParams {
  paymentId: string;
  eventId: string;
  chargeId: string;
  paymentIntentId: string | null;
  balanceTransactionId: string | null;
  fee: number | null;
  net: number | null;
  feeDetails: PaymentWebhookMetaJson | null;
  transferId: string | null;
  applicationFeeId: string | null;
}

interface UpdateStatusFailedFromChargeParams {
  paymentId: string;
  eventId: string;
  chargeId: string;
  paymentIntentId: string | null;
}

interface UpdateRefundAggregateParams {
  paymentId: string;
  eventId: string;
  chargeId: string;
  paymentIntentId: string | null;
  status: PaymentStatus;
  refundedAmount: number;
  applicationFeeRefundedAmount: number;
  applicationFeeRefundId: string | null;
}

interface UpdateApplicationFeeRefundAggregateParams {
  paymentId: string;
  eventId: string;
  applicationFeeRefundedAmount: number;
  applicationFeeRefundId: string | null;
}

const PAYMENT_WEBHOOK_READ_COLUMNS = [
  "id",
  "status",
  "amount",
  "attendance_id",
  "stripe_payment_intent_id",
  "stripe_charge_id",
  "stripe_checkout_session_id",
  "application_fee_id",
  "application_fee_refund_id",
  "application_fee_refunded_amount",
] as const;

type PaymentWebhookReadColumn = (typeof PAYMENT_WEBHOOK_READ_COLUMNS)[number];
export type PaymentWebhookRecord = Pick<PaymentRow, PaymentWebhookReadColumn>;

const PAYMENT_WEBHOOK_READ_SELECT = PAYMENT_WEBHOOK_READ_COLUMNS.join(",");

export type PaymentWebhookRepositoryErrorCategory =
  | "cardinality"
  | "integrity"
  | "transient"
  | "unknown";

export interface PaymentWebhookDbErrorLike {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function classifyReadError(error: PaymentWebhookDbErrorLike): {
  category: PaymentWebhookRepositoryErrorCategory;
  terminal: boolean;
} {
  const rawCode = typeof error.code === "string" ? error.code : "";
  const code = rawCode.toUpperCase();
  const message = normalize(error.message);
  const details = normalize(error.details);
  const hint = normalize(error.hint);

  if (code.startsWith("22") || code.startsWith("23")) {
    return { category: "integrity", terminal: true };
  }

  const cardinalitySignal =
    code === "PGRST116" ||
    message.includes("multiple rows") ||
    message.includes("multiple (or no) rows") ||
    details.includes("multiple") ||
    hint.includes("single json object");

  if (cardinalitySignal) {
    return { category: "cardinality", terminal: true };
  }

  const transientSignal =
    code.startsWith("08") ||
    code.startsWith("53") ||
    code === "57014" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection") ||
    message.includes("temporarily unavailable") ||
    message.includes("rate limit");

  if (transientSignal) {
    return { category: "transient", terminal: false };
  }

  return { category: "unknown", terminal: false };
}

export class PaymentWebhookRepositoryError extends Error {
  readonly operation: string;
  readonly code: string | null;
  readonly category: PaymentWebhookRepositoryErrorCategory;
  readonly terminal: boolean;

  constructor(params: {
    operation: string;
    message: string;
    code?: string | null;
    category: PaymentWebhookRepositoryErrorCategory;
    terminal: boolean;
  }) {
    const codePart = params.code ? ` (code=${params.code})` : "";
    super(
      `PaymentWebhookRepository.${params.operation} failed${codePart} [${params.category}/${
        params.terminal ? "terminal" : "retryable"
      }]: ${params.message}`
    );
    this.name = "PaymentWebhookRepositoryError";
    this.operation = params.operation;
    this.code = params.code ?? null;
    this.category = params.category;
    this.terminal = params.terminal;
  }
}

export function isPaymentWebhookRepositoryError(
  value: unknown
): value is PaymentWebhookRepositoryError {
  return (
    value instanceof PaymentWebhookRepositoryError ||
    (typeof value === "object" &&
      value !== null &&
      "name" in value &&
      value.name === "PaymentWebhookRepositoryError" &&
      "operation" in value &&
      typeof value.operation === "string")
  );
}

function buildReadError(params: {
  operation: string;
  error: PaymentWebhookDbErrorLike;
}): PaymentWebhookRepositoryError {
  const classified = classifyReadError(params.error);
  return new PaymentWebhookRepositoryError({
    operation: params.operation,
    message: params.error.message,
    code: params.error.code,
    category: classified.category,
    terminal: classified.terminal,
  });
}

export class PaymentWebhookRepository {
  constructor(private readonly supabase: AppSupabaseClient) {}

  async findById(paymentId: string): Promise<PaymentWebhookRecord | null> {
    const { data, error } = await this.supabase
      .from("payments")
      .select(PAYMENT_WEBHOOK_READ_SELECT)
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      throw buildReadError({
        operation: "findById",
        error,
      });
    }

    return (data ?? null) as PaymentWebhookRecord | null;
  }

  async findByStripePaymentIntentId(paymentIntentId: string): Promise<PaymentWebhookRecord | null> {
    const { data, error } = await this.supabase
      .from("payments")
      .select(PAYMENT_WEBHOOK_READ_SELECT)
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();

    if (error) {
      throw buildReadError({
        operation: "findByStripePaymentIntentId",
        error,
      });
    }

    return (data ?? null) as PaymentWebhookRecord | null;
  }

  async findByStripeChargeId(chargeId: string): Promise<PaymentWebhookRecord | null> {
    const { data, error } = await this.supabase
      .from("payments")
      .select(PAYMENT_WEBHOOK_READ_SELECT)
      .eq("stripe_charge_id", chargeId)
      .maybeSingle();

    if (error) {
      throw buildReadError({
        operation: "findByStripeChargeId",
        error,
      });
    }

    return (data ?? null) as PaymentWebhookRecord | null;
  }

  async findByCheckoutSessionId(sessionId: string): Promise<PaymentWebhookRecord | null> {
    const { data, error } = await this.supabase
      .from("payments")
      .select(PAYMENT_WEBHOOK_READ_SELECT)
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (error) {
      throw buildReadError({
        operation: "findByCheckoutSessionId",
        error,
      });
    }

    return (data ?? null) as PaymentWebhookRecord | null;
  }

  async findByApplicationFeeId(applicationFeeId: string): Promise<PaymentWebhookRecord | null> {
    const { data, error } = await this.supabase
      .from("payments")
      .select(PAYMENT_WEBHOOK_READ_SELECT)
      .eq("application_fee_id", applicationFeeId)
      .maybeSingle();

    if (error) {
      throw buildReadError({
        operation: "findByApplicationFeeId",
        error,
      });
    }

    return (data ?? null) as PaymentWebhookRecord | null;
  }

  async resolveByPaymentIntentOrMetadata({
    paymentIntentId,
    metadataPaymentId,
  }: ResolveByPaymentIntentOrMetadataParams): Promise<PaymentWebhookRecord | null> {
    if (paymentIntentId) {
      const byPi = await this.findByStripePaymentIntentId(paymentIntentId);
      if (byPi) {
        return byPi;
      }
    }

    if (metadataPaymentId) {
      return this.findById(metadataPaymentId);
    }

    return null;
  }

  async resolveByChargeOrFallback({
    paymentIntentId,
    chargeId,
    metadataPaymentId,
  }: ResolveByChargeOrFallbackParams): Promise<PaymentWebhookRecord | null> {
    if (paymentIntentId) {
      const byPi = await this.findByStripePaymentIntentId(paymentIntentId);
      if (byPi) {
        return byPi;
      }
    }

    const byCharge = await this.findByStripeChargeId(chargeId);
    if (byCharge) {
      return byCharge;
    }

    if (metadataPaymentId) {
      return this.findById(metadataPaymentId);
    }

    return null;
  }

  async resolveCheckoutTarget({
    checkoutSessionId,
    metadataPaymentId,
  }: ResolveCheckoutTargetParams): Promise<PaymentWebhookRecord | null> {
    const bySession = await this.findByCheckoutSessionId(checkoutSessionId);
    if (bySession) {
      return bySession;
    }

    if (metadataPaymentId) {
      return this.findById(metadataPaymentId);
    }

    return null;
  }

  async resolveForDispute({
    paymentIntentId,
    chargeId,
  }: ResolveForDisputeParams): Promise<PaymentWebhookRecord | null> {
    if (paymentIntentId) {
      const byPi = await this.findByStripePaymentIntentId(paymentIntentId);
      if (byPi) {
        return byPi;
      }
    }

    if (chargeId) {
      return this.findByStripeChargeId(chargeId);
    }

    return null;
  }

  async saveCheckoutSessionLink({
    paymentId,
    sessionId,
    paymentIntentId,
  }: SaveCheckoutSessionLinkParams) {
    const now = nowIso();
    const payload: Partial<PaymentUpdate> = {
      stripe_checkout_session_id: sessionId,
      updated_at: now,
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    };

    return this.supabase.from("payments").update(payload).eq("id", paymentId);
  }

  async updateStatusPaidFromPaymentIntent({
    paymentId,
    eventId,
    stripePaymentIntentId,
  }: UpdateStatusPaidFromPaymentIntentParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        status: "paid",
        paid_at: now,
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
        stripe_payment_intent_id: stripePaymentIntentId,
      })
      .eq("id", paymentId);
  }

  async updateStatusFailedFromPaymentIntent({
    paymentId,
    eventId,
    stripePaymentIntentId,
  }: UpdateStatusFailedFromPaymentIntentParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        status: "failed",
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
        stripe_payment_intent_id: stripePaymentIntentId,
      })
      .eq("id", paymentId);
  }

  async updateStatusFailedFromCheckoutSession({
    paymentId,
    eventId,
    checkoutSessionId,
    paymentIntentId,
  }: UpdateStatusFailedFromCheckoutSessionParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        status: "failed",
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
        stripe_checkout_session_id: checkoutSessionId,
        ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      })
      .eq("id", paymentId);
  }

  async updateStatusPaidFromChargeSnapshot({
    paymentId,
    eventId,
    chargeId,
    paymentIntentId,
    balanceTransactionId,
    fee,
    net,
    feeDetails,
    transferId,
    applicationFeeId,
  }: UpdateStatusPaidFromChargeSnapshotParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        status: "paid",
        paid_at: now,
        stripe_charge_id: chargeId,
        stripe_balance_transaction_id: balanceTransactionId,
        stripe_balance_transaction_fee: fee,
        stripe_balance_transaction_net: net,
        stripe_fee_details: feeDetails,
        stripe_transfer_id: transferId,
        application_fee_id: applicationFeeId,
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
        ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      })
      .eq("id", paymentId);
  }

  async updateStatusFailedFromCharge({
    paymentId,
    eventId,
    chargeId,
    paymentIntentId,
  }: UpdateStatusFailedFromChargeParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        status: "failed",
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
        stripe_charge_id: chargeId,
        ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
      })
      .eq("id", paymentId);
  }

  async updateRefundAggregate({
    paymentId,
    eventId,
    chargeId,
    paymentIntentId,
    status,
    refundedAmount,
    applicationFeeRefundedAmount,
    applicationFeeRefundId,
  }: UpdateRefundAggregateParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        status,
        refunded_amount: refundedAmount,
        application_fee_refund_id: applicationFeeRefundId,
        application_fee_refunded_amount: applicationFeeRefundedAmount,
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
        ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
        stripe_charge_id: chargeId,
      })
      .eq("id", paymentId);
  }

  async updateApplicationFeeRefundAggregate({
    paymentId,
    eventId,
    applicationFeeRefundedAmount,
    applicationFeeRefundId,
  }: UpdateApplicationFeeRefundAggregateParams) {
    const now = nowIso();
    return this.supabase
      .from("payments")
      .update({
        application_fee_refund_id: applicationFeeRefundId,
        application_fee_refunded_amount: applicationFeeRefundedAmount,
        webhook_event_id: eventId,
        webhook_processed_at: now,
        updated_at: now,
      })
      .eq("id", paymentId);
  }
}
