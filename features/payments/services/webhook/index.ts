// Webhook署名検証
export type { WebhookSignatureVerifier } from "./webhook-signature-verifier";
export { StripeWebhookSignatureVerifier } from "./webhook-signature-verifier";

// Webhookイベントハンドラー
export type { WebhookEventHandler } from "./webhook-event-handler";
export { StripeWebhookEventHandler } from "./webhook-event-handler";
export { ConnectWebhookHandler } from "./connect-webhook-handler";

// Webhook冪等性保証
export type { WebhookIdempotencyService } from "./webhook-idempotency";
export {
  SupabaseWebhookIdempotencyService,
  IdempotentWebhookProcessor,
} from "./webhook-idempotency";

// 型定義（DB Json 制約に適合させるため index signature を付与）
import type { Json } from "@/types/database";

export type WebhookProcessingResult = {
  success: boolean;
  error?: string;
  paymentId?: string;
  eventId?: string;
  // 終端エラーかどうか（trueの場合はACKして再試行を止める）
  terminal?: boolean;
  // 失敗理由の分類
  reason?: string;
} & { [key: string]: Json | undefined };

export interface WebhookEventMetadata {
  eventId: string;
  eventType: string;
  timestamp: number;
  signature: string;
  processed: boolean;
  processingResult?: WebhookProcessingResult;
}
