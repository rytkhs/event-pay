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

import { logger } from "@core/logging/app-logger";
import { getClientIP } from "@core/utils/ip-detection";

import "@/app/_init/feature-registrations";
import { StripeWebhookEventHandler } from "@features/payments/services/webhook/webhook-event-handler";

// QStash署名検証用のReceiver初期化
const getQstashReceiver = () => {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

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
  const correlationId = `qstash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    logger.info("QStash worker request received", {
      tag: "qstash-processing",
      correlation_id: correlationId,
      path: "/api/workers/stripe-webhook",
    });

    // QStash署名検証
    // const url = request.nextUrl.toString();
    const url = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/stripe-webhook`;
    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    const rawBody = await request.text();

    if (!signature) {
      logger.warn("Missing QStash signature", {
        tag: "qstash-security",
        correlation_id: correlationId,
        ip: getClientIP(request),
      });
      return new NextResponse("Missing QStash signature", { status: 401 });
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({
      signature,
      body: rawBody,
      url,
    });

    if (!isValid) {
      logger.warn("Invalid QStash signature", {
        tag: "qstash-security",
        correlation_id: correlationId,
        signature_preview: signature.substring(0, 20) + "...",
        ip: getClientIP(request),
      });
      return new NextResponse("Invalid QStash signature", { status: 401 });
    }

    logger.info("QStash signature verified", {
      tag: "qstash-processing",
      correlation_id: correlationId,
      delivery_id: deliveryId,
    });

    // リクエストボディのパース
    let webhookBody: QStashWebhookBody;
    try {
      webhookBody = JSON.parse(rawBody);
    } catch (error) {
      logger.error("Failed to parse QStash webhook body", {
        tag: "qstash-processing",
        correlation_id: correlationId,
        error: error instanceof Error ? error.message : "Unknown error",
        body_preview: rawBody.substring(0, 100),
      });
      return new NextResponse("Invalid JSON body", { status: 400 });
    }

    const { event: stripeEvent } = webhookBody;

    if (!stripeEvent?.id || !stripeEvent?.type) {
      logger.error("Missing or invalid event in QStash webhook body", {
        tag: "qstash-processing",
        correlation_id: correlationId,
        has_event: !!stripeEvent,
        event_id: stripeEvent?.id,
        event_type: stripeEvent?.type,
      });
      return new NextResponse("Missing or invalid event data", { status: 400 });
    }

    logger.debug("Processing received Stripe event", {
      tag: "qstash-processing",
      correlation_id: correlationId,
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
    });

    // 既存のWebhookハンドラーで処理
    const handler = new StripeWebhookEventHandler();
    const processingResult = await handler.handleEvent(stripeEvent);

    const processingTime = Date.now() - startTime;

    logger.info("QStash webhook processing completed", {
      tag: "qstash-processing",
      correlation_id: correlationId,
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      delivery_id: deliveryId,
      success: processingResult.success,
      processing_time_ms: processingTime,
      result: processingResult,
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

    logger.error("QStash webhook processing error", {
      tag: "qstash-processing",
      correlation_id: correlationId,
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      processing_time_ms: processingTime,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new NextResponse("Internal server error", { status: 500 });
  }
}
