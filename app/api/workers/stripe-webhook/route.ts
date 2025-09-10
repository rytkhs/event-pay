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

import { logger } from "@core/logging/app-logger";
import { stripe } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";

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
  eventId: string;
  type: string;
  account?: string | null;
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

    const { eventId, type, account } = webhookBody;

    if (!eventId || !type) {
      logger.error("Missing required fields in QStash webhook body", {
        tag: "qstash-processing",
        correlation_id: correlationId,
        event_id: eventId,
        event_type: type,
      });
      return new NextResponse("Missing eventId or type", { status: 400 });
    }

    // Stripe APIからイベントデータを再取得（正規性確保）
    let stripeEvent;
    try {
      logger.debug("Retrieving Stripe event", {
        tag: "qstash-processing",
        correlation_id: correlationId,
        event_id: eventId,
        event_type: type,
        account: account || undefined,
      });

      const retrieveOptions: { stripeAccount?: string } = {};
      if (account) {
        retrieveOptions.stripeAccount = account;
      }

      stripeEvent = await stripe.events.retrieve(eventId, retrieveOptions);
    } catch (error) {
      logger.error("Failed to retrieve Stripe event", {
        tag: "qstash-processing",
        correlation_id: correlationId,
        event_id: eventId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return new NextResponse("Failed to retrieve Stripe event", { status: 404 });
    }

    // イベントタイプ検証
    if (stripeEvent.type !== type) {
      logger.warn("Event type mismatch", {
        tag: "qstash-security",
        correlation_id: correlationId,
        expected_type: type,
        actual_type: stripeEvent.type,
        event_id: eventId,
      });
      return new NextResponse("Event type mismatch", { status: 400 });
    }

    // 既存のWebhookハンドラーで処理
    const handler = new StripeWebhookEventHandler();
    const processingResult = await handler.handleEvent(stripeEvent);

    const processingTime = Date.now() - startTime;

    logger.info("QStash webhook processing completed", {
      tag: "qstash-processing",
      correlation_id: correlationId,
      event_id: eventId,
      event_type: type,
      delivery_id: deliveryId,
      success: processingResult.success,
      processing_time_ms: processingTime,
      result: processingResult,
    });

    return NextResponse.json({
      success: true,
      eventId,
      type,
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
