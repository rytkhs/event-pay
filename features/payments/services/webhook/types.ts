import type { AppResult } from "@core/errors";

import type { Json } from "@/types/database";

export type WebhookProcessingMeta = {
  paymentId?: string;
  eventId?: string;
  terminal?: boolean;
  reason?: string;
} & { [key: string]: Json | undefined };

export type WebhookProcessingResult = AppResult<void, WebhookProcessingMeta>;
