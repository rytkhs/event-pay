import Stripe from "stripe";

import type {
  RefundCreatedCompatibleEventType,
  RefundFailedCompatibleEventType,
  RefundUpdatedCompatibleEventType,
} from "./types";

const REFUND_CREATED_EVENT_TYPES: ReadonlySet<RefundCreatedCompatibleEventType> = new Set([
  "refund.created",
  "charge.refund.created",
]);

const REFUND_UPDATED_EVENT_TYPES: ReadonlySet<RefundUpdatedCompatibleEventType> = new Set([
  "refund.updated",
  "charge.refund.updated",
]);

const REFUND_FAILED_EVENT_TYPES: ReadonlySet<RefundFailedCompatibleEventType> = new Set([
  "refund.failed",
]);

export function isRefundCreatedCompatibleEventType(
  eventType: string
): eventType is RefundCreatedCompatibleEventType {
  return REFUND_CREATED_EVENT_TYPES.has(eventType as RefundCreatedCompatibleEventType);
}

export function isRefundUpdatedCompatibleEventType(
  eventType: string
): eventType is RefundUpdatedCompatibleEventType {
  return REFUND_UPDATED_EVENT_TYPES.has(eventType as RefundUpdatedCompatibleEventType);
}

export function isRefundFailedCompatibleEventType(
  eventType: string
): eventType is RefundFailedCompatibleEventType {
  return REFUND_FAILED_EVENT_TYPES.has(eventType as RefundFailedCompatibleEventType);
}

function isRefundObject(object: unknown): object is Stripe.Refund {
  if (!object || typeof object !== "object") {
    return false;
  }

  const candidate = object as { object?: unknown; id?: unknown };
  return (
    candidate.object === "refund" && typeof candidate.id === "string" && candidate.id.length > 0
  );
}

export function getRefundFromWebhookEvent(event: Stripe.Event): Stripe.Refund | null {
  const payload = (event as { data?: { object?: unknown } }).data?.object;
  return isRefundObject(payload) ? payload : null;
}
