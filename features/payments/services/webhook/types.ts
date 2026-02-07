import type { AppResult } from "@core/errors";

import type { Json } from "@/types/database";

export type WebhookProcessingMeta = {
  paymentId?: string;
  eventId?: string;
  terminal?: boolean;
  reason?: string;
} & { [key: string]: Json | undefined };

export type WebhookProcessingResult = AppResult<void, WebhookProcessingMeta>;

export interface WebhookEventMetadata {
  eventId: string;
  eventType: string;
  timestamp: number;
  signature: string;
  processed: boolean;
  processingResult?: WebhookProcessingResult;
}
