/**
 * Stripe Connect Webhook エンドポイント
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Client } from "@upstash/qstash";
import type Stripe from "stripe";

// Feature adapters initialization (ensure core ports are registered)
import "@/app/_init/feature-registrations";

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import {
  shouldEnforceStripeWebhookIpCheck,
  isStripeWebhookIpAllowed,
} from "@core/security/stripe-ip-allowlist";
import { getStripe, getConnectWebhookSecrets } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";

import { StripeWebhookSignatureVerifier } from "@features/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Webhookは常に動的処理

const getQstashClient = () => {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN is required");
  return new Client({ token });
};

export async function POST(request: NextRequest) {
  const _clientIP = getClientIP(request);
  const requestId = request.headers.get("x-request-id") || generateSecureUuid();
  const connectLogger = logger.withContext({
    request_id: requestId,
    path: request.nextUrl.pathname,
    tag: "connectWebhookProcessing",
  });

  connectLogger.info("Connect webhook request received");

  try {
    // 本番のみ: Stripe Webhook 送信元 IP の許可リスト検証
    if (shouldEnforceStripeWebhookIpCheck()) {
      const clientIp = _clientIP;
      const allowed = await isStripeWebhookIpAllowed(clientIp);
      if (!allowed) {
        // Security logging replaced with standard logger
        logger.warn("Webhook IP not allowed", {
          clientIp,
          userAgent: request.headers.get("user-agent") || undefined,
        });
        return createProblemResponse("FORBIDDEN", {
          instance: "/api/webhooks/stripe-connect",
          detail: "IP not allowed",
        });
      }
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      connectLogger.warn("Connect webhook signature missing");
      return createProblemResponse("MISSING_PARAMETER", {
        instance: "/api/webhooks/stripe-connect",
        detail: "Missing signature",
      });
    }

    // Webhookシークレットはリクエスト単位で取得（ローテーション/テスト環境切替に対応）
    const webhookSecrets = getConnectWebhookSecrets();

    // 共通の署名検証ロジックを使用
    // Security logging replaced with standard logger
    const verifier = new StripeWebhookSignatureVerifier(getStripe(), webhookSecrets);

    connectLogger.debug("Starting Connect webhook signature verification");
    const verification = await verifier.verifySignature({ payload, signature });
    if (!verification.isValid || !verification.event) {
      connectLogger.warn("Connect webhook signature verification failed");
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe-connect",
        detail: "Invalid signature",
      });
    }
    const event: Stripe.Event = verification.event;

    connectLogger.info("Connect webhook signature verified", {
      event_id: event.id,
      event_type: event.type,
    });

    // QStash に publish（完全なイベントデータを送信）
    const workerUrl = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/stripe-connect-webhook`;
    connectLogger.debug("Publishing Connect webhook to QStash", {
      worker_url: workerUrl,
      event_id: event.id,
      event_type: event.type,
    });

    const qstash = getQstashClient();
    const publishRes = await qstash.publishJSON({
      url: workerUrl,
      body: {
        event: event, // 検証済みの完全なStripe.Eventオブジェクト
      },
      deduplicationId: event.id,
      retries: 3,
      delay: 0,
      headers: { "x-source": "stripe-connect-webhook", "x-request-id": requestId },
    });

    connectLogger.info("Connect webhook published to QStash", {
      event_id: event.id,
      event_type: event.type,
      qstash_message_id: publishRes.messageId,
    });

    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      qstashMessageId: publishRes.messageId,
    });
  } catch (error) {
    // 詳細なエラー情報をログに出力
    connectLogger.error("Connect webhook processing error", {
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
    });

    // 失敗時は 500 を返し Stripe に再送してもらう
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/webhooks/stripe-connect",
      detail: "Connect webhook handler failed",
    });
  }
}

// GETメソッドは許可しない
export async function GET() {
  return createProblemResponse("INVALID_REQUEST", {
    instance: "/api/webhooks/stripe-connect",
    detail: "Method not allowed",
    status: 405,
  });
}
