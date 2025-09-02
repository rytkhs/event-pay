import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createProblemResponse } from "@core/api/problem-details";
// Stripe 型は共有クライアント経由で利用するため未使用
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import {
  shouldEnforceStripeWebhookIpCheck,
  isStripeWebhookIpAllowed,
} from "@core/security/stripe-ip-allowlist";
import { stripe as sharedStripe, getWebhookSecrets } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";

import type { WebhookProcessingResult } from "@features/payments/services/webhook";
import { SupabaseWebhookIdempotencyService } from "@features/payments/services/webhook/webhook-idempotency";
import { StripeWebhookSignatureVerifier } from "@features/payments/services/webhook/webhook-signature-verifier";
// import { StripeWebhookEventHandler } from '@features/payments/services/webhook/webhook-event-handler';
// Rate limiting middleware intentionally not used on this webhook per Stripe best practice (429 triggers unnecessary retries)

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Webhookは常に動的処理

function createServices() {
  const stripe = sharedStripe;

  // Security logging replaced with standard logger
  const signatureVerifier = new StripeWebhookSignatureVerifier(stripe, getWebhookSecrets());
  const idempotencyService = new SupabaseWebhookIdempotencyService<WebhookProcessingResult>();

  return { signatureVerifier, idempotencyService };
}

export async function POST(request: NextRequest) {
  let enqueued = false;
  // 失敗時に DLQ に書き込むための現在処理中のイベント情報
  let eventMeta: { id: string; type: string } | null = null;
  const requestId = request.headers.get("x-request-id") || generateSecureUuid();
  const webhookLogger = logger.withContext({
    request_id: requestId,
    path: request.nextUrl.pathname,
    tag: "webhookProcessing",
  });

  webhookLogger.info("Webhook request received");

  try {
    const { signatureVerifier, idempotencyService } = createServices();

    // 本番のみ: Stripe Webhook 送信元 IP の許可リスト検証
    if (shouldEnforceStripeWebhookIpCheck()) {
      const clientIp = getClientIP(request);
      const allowed = await isStripeWebhookIpAllowed(clientIp);
      if (!allowed) {
        webhookLogger.warn("Webhook IP not allowed", {
          clientIp,
          userAgent: request.headers.get("user-agent") || undefined,
        });
        return createProblemResponse("FORBIDDEN", {
          instance: "/api/webhooks/stripe",
          detail: "IP not allowed",
        });
      }
    }

    // リクエストボディとヘッダーの取得
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      webhookLogger.warn("Webhook signature missing");
      webhookLogger.warn("Webhook missing signature", {
        hasPayload: !!payload,
        payloadLength: payload.length,
        ip: getClientIP(request),
        userAgent: request.headers.get("user-agent") || undefined,
      });

      return createProblemResponse("MISSING_PARAMETER", {
        instance: "/api/webhooks/stripe",
        detail: "Missing stripe-signature header",
      });
    }

    // 署名検証
    webhookLogger.debug("Starting signature verification");
    const verificationResult = await signatureVerifier.verifySignature({
      payload,
      signature,
    });

    if (!verificationResult.isValid || !verificationResult.event) {
      webhookLogger.warn("Webhook signature verification failed");
      // 外部公開用のエラーメッセージは統一し、詳細はセキュリティログに依存
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe",
        detail: "Invalid webhook signature",
      });
    }

    const event = verificationResult.event;

    // DLQ 用のメタデータを確定
    eventMeta = { id: event.id, type: event.type };

    webhookLogger.info("Webhook signature verified", {
      event_id: event.id,
      event_type: event.type,
    });

    // 受信イベントを pending として即時エンキュー（最小処理）
    // data.object.id はタイプにより存在しない場合があるため、あれば保存
    const objectId: string | null = ((): string | null => {
      const data: unknown = (event as unknown as { data?: unknown }).data;
      if (!data || typeof data !== "object") {
        return null;
      }
      const obj: unknown = (data as { object?: unknown }).object;
      if (!obj || typeof obj !== "object") {
        return null;
      }
      const idVal = (obj as { id?: unknown }).id;
      return typeof idVal === "string" && idVal.length > 0 ? idVal : null;
    })();

    webhookLogger.debug("Enqueueing webhook event for processing", {
      event_id: event.id,
      event_type: event.type,
      object_id: objectId,
    });

    await idempotencyService.enqueueEventForProcessing(event.id, event.type, {
      stripe_account_id: (event as unknown as { account?: string | null }).account ?? null,
      stripe_event_created:
        (event as { created?: number }).created ?? Math.floor(Date.now() / 1000),
      object_id: objectId,
    });
    enqueued = true;

    webhookLogger.info("Webhook event enqueued successfully", {
      event_id: event.id,
      event_type: event.type,
      tag: "enqueueSucceeded",
    });

    // 非同期処理は別ジョブに委譲するため、ここでは即 200 を返す
    // 参考: https://docs.stripe.com/webhooks#handle-events-asynchronously
    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      enqueued: true,
    });
  } catch (error) {
    // 予期しないエラーのログ
    try {
      webhookLogger.error("Webhook unexpected error", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        ip: getClientIP(request),
      });
    } catch (_logError) {
      // ログ失敗時は黙って継続
    }

    // フォールバックで構造化ログ出力
    logger.error("Webhook route error", {
      tag: "webhookRouteError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      enqueued,
    });

    // enqueue 成功後に発生した例外は 200 を返して Stripe の不要なリトライを防止
    if (enqueued) {
      return NextResponse.json({ received: true, enqueued: true });
    }

    // enqueue 前に失敗している場合は Stripe の自動リトライを促す
    try {
      if (eventMeta) {
        const { idempotencyService: dlqSvc } = createServices();
        await dlqSvc.markEventFailed(
          eventMeta.id,
          eventMeta.type,
          error instanceof Error ? error.message : "unexpected_error"
        );
      }
    } catch (dlqError) {
      logger.error("Failed to record failed webhook event to DLQ", {
        tag: "webhookDlqError",
        original_error: error instanceof Error ? error.message : String(error),
        dlq_error: dlqError instanceof Error ? dlqError.message : String(dlqError),
      });
    }

    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/webhooks/stripe",
      detail: "Internal server error",
    });
  }
}

// GETメソッドは許可しない
export async function GET() {
  return createProblemResponse("INVALID_REQUEST", {
    instance: "/api/webhooks/stripe",
    detail: "Method not allowed",
    status: 405,
  });
}

// その他のHTTPメソッドも許可しない
export async function PUT() {
  return createProblemResponse("INVALID_REQUEST", {
    instance: "/api/webhooks/stripe",
    detail: "Method not allowed",
    status: 405,
  });
}

export async function DELETE() {
  return createProblemResponse("INVALID_REQUEST", {
    instance: "/api/webhooks/stripe",
    detail: "Method not allowed",
    status: 405,
  });
}

export async function PATCH() {
  return createProblemResponse("INVALID_REQUEST", {
    instance: "/api/webhooks/stripe",
    detail: "Method not allowed",
    status: 405,
  });
}
