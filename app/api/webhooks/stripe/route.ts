/**
 * Stripe Webhook エンドポイント (QStash統合版)
 * 決済関連のWebhookイベントを受信し、QStashに転送する
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Client } from "@upstash/qstash";

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import {
  shouldEnforceStripeWebhookIpCheck,
  isStripeWebhookIpAllowed,
} from "@core/security/stripe-ip-allowlist";
import { getWebhookSecrets, stripe as sharedStripe } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";

import { StripeWebhookSignatureVerifier } from "@features/payments/services/webhook/webhook-signature-verifier";

// QStashクライアント初期化
const getQstashClient = () => {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error("QSTASH_TOKEN environment variable is required");
  }
  return new Client({ token });
};

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || generateSecureUuid();
  const startTime = Date.now();

  logger.info("Webhook request received", {
    request_id: requestId,
    path: "/api/webhooks/stripe",
    tag: "webhookProcessing",
  });

  try {
    const clientIP = getClientIP(request);

    // IP許可リストのチェック（本番環境でのセキュリティ）
    if (shouldEnforceStripeWebhookIpCheck() && !isStripeWebhookIpAllowed(clientIP)) {
      logger.warn("Webhook request from unauthorized IP", {
        tag: "security-rejected",
        ip: clientIP,
        request_id: requestId,
      });
      return createProblemResponse("FORBIDDEN", {
        instance: "/api/webhooks/stripe",
        detail: "IP address not authorized for webhook access",
      });
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      logger.warn("Missing Stripe signature header", {
        request_id: requestId,
        tag: "security-rejected",
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe",
        detail: "Missing Stripe signature",
      });
    }

    // Stripe署名検証
    const signatureVerifier = new StripeWebhookSignatureVerifier(sharedStripe, getWebhookSecrets());
    const verificationResult = await signatureVerifier.verifySignature({
      payload,
      signature,
    });

    if (!verificationResult.isValid || !verificationResult.event) {
      logger.warn("Webhook signature verification failed", {
        request_id: requestId,
        tag: "security-rejected",
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe",
        detail: "Invalid webhook signature",
      });
    }

    const event = verificationResult.event;

    logger.info("Webhook signature verified", {
      event_id: event.id,
      event_type: event.type,
      request_id: requestId,
      tag: "webhookProcessing",
    });

    // QStashに転送
    const workerUrl = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/stripe-webhook`;
    // const workerUrl = "https://de438ee16cfb.ngrok-free.app/api/workers/stripe-webhook";

    const qstashBody = {
      eventId: event.id,
      type: event.type,
      account: (event as unknown as { account?: string | null }).account ?? null,
    };

    logger.debug("Publishing to QStash", {
      event_id: event.id,
      event_type: event.type,
      worker_url: workerUrl,
      deduplication_id: event.id,
      request_id: requestId,
      tag: "qstash-publish",
    });

    const qstash = getQstashClient();
    const qstashResult = await qstash.publishJSON({
      url: workerUrl,
      body: qstashBody,
      deduplicationId: event.id, // Stripeイベントの重複排除
      retries: 3, // プラン上限に合わせる
      delay: 0, // 即座に処理
      headers: {
        "x-source": "stripe-webhook",
        "x-request-id": requestId,
      },
    });

    const processingTime = Date.now() - startTime;

    logger.info("Webhook successfully published to QStash", {
      tag: "qstash-published",
      event_id: event.id,
      event_type: event.type,
      qstash_message_id: qstashResult.messageId,
      processing_time_ms: processingTime,
      request_id: requestId,
    });

    // Stripeに即座に200を返す（QStashが非同期処理を担当）
    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      qstashMessageId: qstashResult.messageId,
      requestId,
      processingTimeMs: processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Webhook processing error", {
      tag: "webhook-error",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      processing_time_ms: processingTime,
      request_id: requestId,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // QStash転送に失敗した場合でも、Stripeには500を返してリトライを促す
    return new NextResponse("Internal server error", { status: 500 });
  }
}
