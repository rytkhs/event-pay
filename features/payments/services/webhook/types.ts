import type { AppResult } from "@core/errors";

import type { Json } from "@/types/database";

export type WebhookProcessingMeta = {
  paymentId?: string;
  eventId?: string;
  terminal?: boolean;
  reason?: string;
} & { [key: string]: Json | undefined };

export type WebhookProcessingResult = AppResult<void, WebhookProcessingMeta>;

export type RefundCreatedCompatibleEventType = "refund.created" | "charge.refund.created";
export type RefundUpdatedCompatibleEventType = "refund.updated" | "charge.refund.updated";
export type RefundFailedCompatibleEventType = "refund.failed";
