import type { AppResult } from "@core/errors";
import type { PaymentWebhookMetaJson } from "@core/types/payment";

export type WebhookProcessingMeta = {
  paymentId?: string;
  eventId?: string;
  terminal?: boolean;
  reason?: string;
} & { [key: string]: PaymentWebhookMetaJson | undefined };

export type WebhookProcessingResult = AppResult<void, WebhookProcessingMeta>;

export type RefundCreatedCompatibleEventType = "refund.created" | "charge.refund.created";
export type RefundUpdatedCompatibleEventType = "refund.updated" | "charge.refund.updated";
export type RefundFailedCompatibleEventType = "refund.failed";
