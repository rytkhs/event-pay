/**
 * QStash Webhook Worker for Stripe Events
 *
 * このエンドポイントは：
 * 1. QStashからの署名を検証
 * 2. StripeイベントIDを受信
 * 3. Stripe APIからイベントデータを再取得
 * 4. 既存のWebhookハンドラーで処理
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";
import type Stripe from "stripe";

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import { logSecurityEvent } from "@core/security/security-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { getClientIP } from "@core/utils/ip-detection";

import "@/app/_init/feature-registrations";
import { StripeWebhookEventHandler } from "@features/payments/services/webhook/webhook-event-handler";

// QStash署名検証用のReceiver初期化
const getQstashReceiver = () => {
  const currentKey = getEnv().QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = getEnv().QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey || !nextKey) {
    throw new Error("QStash signing keys are required");
  }

  return new Receiver({
    currentSigningKey: currentKey,
    nextSigningKey: nextKey,
  });
};

interface QStashWebhookBody {
  event: Stripe.Event;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const correlationId = `qstash_${generateSecureUuid()}`;

  const qstashLogger = logger.withContext({
    category: "stripe_webhook",
    action: "qstash_worker_processing",
    actor_type: "webhook",
    correlation_id: correlationId,
    request_id: correlationId,
    path: "/api/workers/stripe-webhook",
  });

  try {
    qstashLogger.info("QStash worker request received");

    // QStash署名検証
    // const url = request.nextUrl.toString();
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-webhook`;
    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    const rawBody = await request.text();

    if (!signature) {
      logSecurityEvent({
        type: "QSTASH_SIGNATURE_MISSING",
        severity: "MEDIUM",
        message: "Missing QStash signature",
        details: {
          correlation_id: correlationId,
          request_id: correlationId,
          path: "/api/workers/stripe-webhook",
        },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/workers/stripe-webhook",
        detail: "Missing QStash signature",
        correlation_id: correlationId,
      });
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({
      signature,
      body: rawBody,
      url,
    });

    if (!isValid) {
      logSecurityEvent({
        type: "QSTASH_SIGNATURE_INVALID",
        severity: "MEDIUM",
        message: "Invalid QStash signature",
        details: {
          correlation_id: correlationId,
          request_id: correlationId,
          signature_preview: signature.substring(0, 20) + "...",
          path: "/api/workers/stripe-webhook",
        },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/workers/stripe-webhook",
        detail: "Invalid QStash signature",
        correlation_id: correlationId,
      });
    }

    qstashLogger.info("QStash signature verified", {
      delivery_id: deliveryId,
    });

    // リクエストボディのパース
    let webhookBody: QStashWebhookBody;
    try {
      webhookBody = JSON.parse(rawBody);
    } catch (error) {
      qstashLogger.error("Failed to parse QStash webhook body", {
        error: error instanceof Error ? error.message : "Unknown error",
        body_preview: rawBody.substring(0, 100),
        outcome: "failure",
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/workers/stripe-webhook",
        detail: "Invalid JSON body",
        correlation_id: correlationId,
      });
    }

    const { event: stripeEvent } = webhookBody;

    if (!stripeEvent?.id || !stripeEvent?.type) {
      qstashLogger.error("Missing or invalid event in QStash webhook body", {
        has_event: !!stripeEvent,
        event_id: stripeEvent?.id,
        event_type: stripeEvent?.type,
        outcome: "failure",
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/workers/stripe-webhook",
        detail: "Missing or invalid event data",
        correlation_id: correlationId,
      });
    }

    qstashLogger.debug("Processing received Stripe event", {
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
    });

    // 既存のWebhookハンドラーで処理
    const handler = new StripeWebhookEventHandler();
    const processingResult = await handler.handleEvent(stripeEvent);

    const processingTime = Date.now() - startTime;

    // ハンドラが失敗を返した場合の処理
    if (
      processingResult &&
      typeof processingResult === "object" &&
      (processingResult as any).success === false
    ) {
      // 終端エラー（terminal: true）の場合
      if ((processingResult as any).terminal === true) {
        qstashLogger.error("QStash webhook processing terminal failure", {
          event_id: stripeEvent.id,
          event_type: stripeEvent.type,
          delivery_id: deliveryId,
          processing_time_ms: processingTime,
          reason: (processingResult as any).reason,
          error: (processingResult as any).error,
          outcome: "failure",
        });

        return createProblemResponse("INTERNAL_ERROR", {
          instance: "/api/workers/stripe-webhook",
          detail:
            (processingResult as any).error || "Worker failed with terminal error. Will not retry.",
          correlation_id: correlationId,
        });
      }

      // 非終端エラー（terminal: false または undefined）の場合
      qstashLogger.error("QStash webhook processing retryable failure", {
        event_id: stripeEvent.id,
        event_type: stripeEvent.type,
        delivery_id: deliveryId,
        processing_time_ms: processingTime,
        reason: (processingResult as any).reason,
        error: (processingResult as any).error,
        terminal: false,
        outcome: "failure",
      });

      return createProblemResponse("INTERNAL_ERROR", {
        instance: "/api/workers/stripe-webhook",
        detail:
          (processingResult as any).error ||
          "Worker failed with retryable error. QStash will retry.",
        correlation_id: correlationId,
      });
    }

    qstashLogger.info("QStash webhook processing completed", {
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      delivery_id: deliveryId,
      success: processingResult.success,
      processing_time_ms: processingTime,
      payment_id: (processingResult as any)?.paymentId || undefined,
      result: processingResult,
      outcome: "success",
    });

    return NextResponse.json({
      success: true,
      eventId: stripeEvent.id,
      type: stripeEvent.type,
      processingResult,
      correlationId,
      deliveryId,
      processingTimeMs: processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    qstashLogger.error("QStash webhook processing error", {
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      processing_time_ms: processingTime,
      stack: error instanceof Error ? error.stack : undefined,
      outcome: "failure",
    });

    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/workers/stripe-webhook",
      detail: "Worker failed to process event",
      correlation_id: correlationId,
    });
  }
}
