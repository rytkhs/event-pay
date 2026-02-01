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

import { type NextRequest, NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";
import type Stripe from "stripe";

import { respondWithCode, respondWithProblem } from "@core/errors/server";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import { logSecurityEvent } from "@core/security/security-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { getClientIP } from "@core/utils/ip-detection";

import { StripeWebhookEventHandler } from "@features/payments/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

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
  ensureFeaturesRegistered();
  const startTime = Date.now();
  const correlationId = `qstash_${generateSecureUuid()}`;
  const baseLogContext = { category: "stripe_webhook" as const, actorType: "webhook" as const };

  const qstashLogger = logger.withContext({
    category: "stripe_webhook",
    action: "qstash_worker_processing",
    actor_type: "webhook",
    correlation_id: correlationId,
    request_id: correlationId,
    path: "/api/workers/stripe-webhook",
  });

  let deliveryId: string | null = null;
  let stripeEvent: Stripe.Event | undefined;

  try {
    qstashLogger.info("QStash worker request received");

    // QStash署名検証
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-webhook`;
    const signature = request.headers.get("Upstash-Signature");
    deliveryId = request.headers.get("Upstash-Delivery-Id");
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
      return respondWithCode("UNAUTHORIZED", {
        instance: "/api/workers/stripe-webhook",
        detail: "Missing QStash signature",
        correlationId,
        logContext: { ...baseLogContext, action: "qstash_signature_missing" },
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
      return respondWithCode("UNAUTHORIZED", {
        instance: "/api/workers/stripe-webhook",
        detail: "Invalid QStash signature",
        correlationId,
        logContext: { ...baseLogContext, action: "qstash_signature_invalid" },
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
      return respondWithProblem(error, {
        instance: "/api/workers/stripe-webhook",
        detail: "Invalid JSON body",
        correlationId,
        defaultCode: "WEBHOOK_INVALID_PAYLOAD",
        logContext: {
          category: "stripe_webhook",
          actorType: "webhook",
          action: "qstash_worker_parse_body",
        },
      });
    }

    stripeEvent = webhookBody.event;

    if (!stripeEvent?.id || !stripeEvent?.type) {
      return respondWithCode("INVALID_REQUEST", {
        instance: "/api/workers/stripe-webhook",
        detail: "Missing or invalid event data",
        correlationId,
        logContext: { ...baseLogContext, action: "invalid_event_data" },
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
    if (processingResult && processingResult.success === false) {
      return respondWithProblem(
        (processingResult as any).error || "Worker failed with internal error",
        {
          instance: "/api/workers/stripe-webhook",
          correlationId,
          defaultCode: "WEBHOOK_UNEXPECTED_ERROR",
          logContext: {
            category: "stripe_webhook",
            actorType: "webhook",
            action: (processingResult as any).terminal
              ? "qstash_worker_terminal_failure"
              : "qstash_worker_retryable_failure",
            additionalData: {
              delivery_id: deliveryId,
              event_id: stripeEvent?.id,
              event_type: stripeEvent?.type,
              processing_time_ms: processingTime,
              reason: (processingResult as any).reason,
              error: (processingResult as any).error,
            },
          },
        }
      );
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
    return respondWithProblem(error, {
      instance: "/api/workers/stripe-webhook",
      detail: "Worker failed to process event",
      correlationId: correlationId,
      defaultCode: "WEBHOOK_UNEXPECTED_ERROR",
      logContext: {
        category: "stripe_webhook",
        actorType: "webhook",
        action: "qstash_worker_error",
        additionalData: {
          correlationId,
          delivery_id: deliveryId,
          processing_time_ms: processingTime,
        },
      },
    });
  }
}
