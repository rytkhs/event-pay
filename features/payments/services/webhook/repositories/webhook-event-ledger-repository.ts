import Stripe from "stripe";

import type { AppSupabaseClient } from "@core/types/supabase";

export type WebhookEventLedgerStatus = "processing" | "succeeded" | "failed";
const PROCESSING_STALE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BEGIN_ATTEMPTS = 5;

interface WebhookEventLedgerRow {
  stripe_event_id: string;
  processing_status: WebhookEventLedgerStatus;
  is_terminal_failure: boolean;
  last_error_code: string | null;
  last_error_reason: string | null;
  updated_at: string;
}

export type WebhookLedgerBeginAction =
  | "process"
  | "ack_duplicate_succeeded"
  | "ack_duplicate_in_progress"
  | "ack_duplicate_failed_terminal";

export interface WebhookLedgerBeginResult {
  action: WebhookLedgerBeginAction;
  dedupeKey: string;
  stripeObjectId: string | null;
  status?: WebhookEventLedgerStatus;
  lastErrorCode?: string | null;
  lastErrorReason?: string | null;
}

export interface WebhookLedgerFailureDetails {
  message: string;
  code?: string | null;
  constraint?: string | null;
  details?: string | null;
  operation: "begin" | "mark_succeeded" | "mark_failed";
}

function getStripeObjectId(event: Stripe.Event): string | null {
  const objectCandidate = event.data?.object as { id?: unknown } | undefined;
  const stripeObjectId = objectCandidate?.id;

  return typeof stripeObjectId === "string" && stripeObjectId.length > 0 ? stripeObjectId : null;
}

function getErrorConstraint(error: {
  constraint?: string | null;
  details?: string | null;
}): string | null {
  if (typeof error.constraint === "string" && error.constraint.length > 0) {
    return error.constraint;
  }

  if (typeof error.details !== "string" || error.details.length === 0) {
    return null;
  }

  const match = error.details.match(/constraint\s+"([^"]+)"/i);
  return match?.[1] ?? null;
}

function isStripeEventIdUniqueViolation(error: {
  code?: string | null;
  constraint?: string | null;
  details?: string | null;
}): boolean {
  if (error.code !== "23505") {
    return false;
  }

  const constraint = getErrorConstraint(error);
  return constraint === "webhook_event_ledger_stripe_event_id_key";
}

function isTerminalFailedState(row: WebhookEventLedgerRow): boolean {
  if (row.is_terminal_failure) {
    return true;
  }

  const errorCode = row.last_error_code;
  if (errorCode === "WEBHOOK_INVALID_PAYLOAD") {
    return true;
  }

  return (
    typeof errorCode === "string" && (errorCode.startsWith("22") || errorCode.startsWith("23"))
  );
}

function isStaleProcessing(updatedAt: string, now = Date.now()): boolean {
  const updatedAtMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return true;
  }
  return now - updatedAtMs >= PROCESSING_STALE_TIMEOUT_MS;
}

function toIsoString(ms: number): string {
  return new Date(ms).toISOString();
}

export class WebhookEventLedgerRepository {
  constructor(private readonly supabase: AppSupabaseClient) {}

  async beginProcessing(event: Stripe.Event): Promise<WebhookLedgerBeginResult> {
    const stripeObjectId = getStripeObjectId(event);
    const dedupeKey = `${event.type}:${stripeObjectId ?? "unknown"}`;
    for (let attempt = 0; attempt < MAX_BEGIN_ATTEMPTS; attempt += 1) {
      const { data: existing, error: selectError } = await this.supabase
        .from("webhook_event_ledger")
        .select(
          "stripe_event_id, processing_status, is_terminal_failure, last_error_code, last_error_reason, updated_at"
        )
        .eq("stripe_event_id", event.id)
        .maybeSingle<WebhookEventLedgerRow>();

      if (selectError) {
        throw this.toFailure(selectError, "begin");
      }

      if (existing?.processing_status === "succeeded") {
        return {
          action: "ack_duplicate_succeeded",
          dedupeKey,
          stripeObjectId,
          status: existing.processing_status,
        };
      }

      if (existing?.processing_status === "processing") {
        if (!isStaleProcessing(existing.updated_at)) {
          return {
            action: "ack_duplicate_in_progress",
            dedupeKey,
            stripeObjectId,
            status: existing.processing_status,
          };
        }
      }

      if (existing?.processing_status === "failed" && isTerminalFailedState(existing)) {
        return {
          action: "ack_duplicate_failed_terminal",
          dedupeKey,
          stripeObjectId,
          status: existing.processing_status,
          lastErrorCode: existing.last_error_code,
          lastErrorReason: existing.last_error_reason,
        };
      }

      if (!existing) {
        const { error: insertError } = await this.supabase.from("webhook_event_ledger").insert({
          stripe_event_id: event.id,
          event_type: event.type,
          stripe_object_id: stripeObjectId,
          dedupe_key: dedupeKey,
          processing_status: "processing",
        });

        if (!insertError) {
          return {
            action: "process",
            dedupeKey,
            stripeObjectId,
            status: "processing",
          };
        }

        if (isStripeEventIdUniqueViolation(insertError)) {
          continue;
        }

        throw this.toFailure(insertError, "begin");
      }

      const staleThresholdIso = toIsoString(Date.now() - PROCESSING_STALE_TIMEOUT_MS);
      let claimQuery = this.supabase
        .from("webhook_event_ledger")
        .update({
          processing_status: "processing",
          event_type: event.type,
          stripe_object_id: stripeObjectId,
          dedupe_key: dedupeKey,
          updated_at: new Date().toISOString(),
          is_terminal_failure: false,
          last_error_code: null,
          last_error_reason: null,
        })
        .eq("stripe_event_id", event.id);

      if (existing.processing_status === "failed") {
        claimQuery = claimQuery.eq("processing_status", "failed");
      }

      if (existing.processing_status === "processing") {
        claimQuery = claimQuery
          .eq("processing_status", "processing")
          .lte("updated_at", staleThresholdIso);
      }

      const { data: claimedRow, error: updateError } = await claimQuery
        .select("stripe_event_id")
        .maybeSingle<{ stripe_event_id: string }>();

      if (updateError) {
        throw this.toFailure(updateError, "begin");
      }

      if (claimedRow) {
        return {
          action: "process",
          dedupeKey,
          stripeObjectId,
          status: "processing",
        };
      }
    }

    throw {
      message: "Failed to acquire webhook ledger entry due to concurrent updates",
      operation: "begin",
    } satisfies WebhookLedgerFailureDetails;
  }

  async findLatestByDedupeKey(
    dedupeKey: string,
    currentEventId: string
  ): Promise<{ stripe_event_id: string; processing_status: WebhookEventLedgerStatus } | null> {
    const { data, error } = await this.supabase
      .from("webhook_event_ledger")
      .select("stripe_event_id, processing_status")
      .eq("dedupe_key", dedupeKey)
      .neq("stripe_event_id", currentEventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ stripe_event_id: string; processing_status: WebhookEventLedgerStatus }>();

    if (error) {
      throw this.toFailure(error, "begin");
    }

    return data;
  }

  async markSucceeded(eventId: string): Promise<void> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from("webhook_event_ledger")
      .update({
        processing_status: "succeeded",
        processed_at: now,
        updated_at: now,
        is_terminal_failure: false,
        last_error_code: null,
        last_error_reason: null,
      })
      .eq("stripe_event_id", eventId)
      .select("stripe_event_id")
      .maybeSingle<{ stripe_event_id: string }>();

    if (error) {
      throw this.toFailure(error, "mark_succeeded");
    }

    if (!data) {
      throw {
        message: `Ledger row not found while marking succeeded: ${eventId}`,
        operation: "mark_succeeded",
      } satisfies WebhookLedgerFailureDetails;
    }
  }

  async markFailed(
    eventId: string,
    params: { errorCode?: string | null; reason?: string | null; terminal?: boolean }
  ): Promise<void> {
    const { errorCode = null, reason = null, terminal = false } = params;

    const { data, error } = await this.supabase
      .from("webhook_event_ledger")
      .update({
        processing_status: "failed",
        is_terminal_failure: terminal,
        last_error_code: errorCode,
        last_error_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_event_id", eventId)
      .select("stripe_event_id")
      .maybeSingle<{ stripe_event_id: string }>();

    if (error) {
      throw this.toFailure(error, "mark_failed");
    }

    if (!data) {
      throw {
        message: `Ledger row not found while marking failed: ${eventId}`,
        operation: "mark_failed",
      } satisfies WebhookLedgerFailureDetails;
    }
  }

  private toFailure(
    error: {
      message: string;
      code?: string | null;
      constraint?: string | null;
      details?: string | null;
    },
    operation: WebhookLedgerFailureDetails["operation"]
  ): WebhookLedgerFailureDetails {
    return {
      message: error.message,
      code: error.code,
      constraint: getErrorConstraint(error),
      details: error.details,
      operation,
    };
  }
}
