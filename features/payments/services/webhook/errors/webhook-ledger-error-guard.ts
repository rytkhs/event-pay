import type { WebhookLedgerFailureDetails } from "../repositories/webhook-event-ledger-repository";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWebhookLedgerFailureDetails(
  value: unknown
): value is WebhookLedgerFailureDetails {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.message) &&
    (value.operation === "begin" ||
      value.operation === "mark_succeeded" ||
      value.operation === "mark_failed")
  );
}
