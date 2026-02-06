// Webhookイベントハンドラー
export type { WebhookEventHandler } from "./webhook-event-handler";
export { StripeWebhookEventHandler } from "./webhook-event-handler";

// 旧Webhook冪等性保証モジュールはQStash移行に伴い廃止

import type { AppResult } from "@core/errors";

// 型定義（DB Json 制約に適合させるため index signature を付与）
import type { Json } from "@/types/database";

export type WebhookProcessingMeta = {
  paymentId?: string;
  eventId?: string;
  // 終端エラーかどうか（trueの場合はACKして再試行を止める）
  terminal?: boolean;
  // 失敗理由の分類
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
