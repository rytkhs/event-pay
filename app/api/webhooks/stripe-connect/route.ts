/**
 * Stripe Connect Webhook エンドポイント
 *
 * 処理フロー:
 * 1. IP許可リスト検証（本番環境のみ）
 * 2. Webhook署名検証（ローテーション対応）
 * 3. account.updatedイベントの検証
 * 4. QStashへの転送（非同期処理）
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Client } from "@upstash/qstash";
import type Stripe from "stripe";

// Feature adapters initialization (ensure core ports are registered)

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import {
  shouldEnforceStripeWebhookIpCheck,
  isStripeWebhookIpAllowed,
} from "@core/security/stripe-ip-allowlist";
import { getStripe, getConnectWebhookSecrets } from "@core/stripe/client";
import { getEnv } from "@core/utils/cloudflare-env";
import { getClientIP } from "@core/utils/ip-detection";

import { StripeWebhookSignatureVerifier } from "@features/payments/services/webhook/webhook-signature-verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // Webhookは常に動的処理

const getQstashClient = () => {
  const token = getEnv().QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN is required");
  return new Client({ token });
};

export async function POST(request: NextRequest) {
  const _clientIP = getClientIP(request);
  const requestId = request.headers.get("x-request-id") || generateSecureUuid();
  const connectLogger = logger.withContext({
    category: "stripe_webhook",
    action: "stripe_connect_webhook_receive",
    actor_type: "webhook",
    request_id: requestId,
    path: request.nextUrl.pathname,
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
          category: "security",
          action: "webhook_ip_check",
          actor_type: "webhook",
          clientIp,
          userAgent: request.headers.get("user-agent") || undefined,
          outcome: "failure",
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

    // テスト環境での同期処理モード（E2Eテスト用）
    // SKIP_QSTASH_IN_TEST=true の場合、QStashをスキップして直接処理
    const shouldProcessSync = getEnv().SKIP_QSTASH_IN_TEST === "true";

    if (shouldProcessSync) {
      connectLogger.info("Test mode: Processing connect webhook synchronously (QStash skipped)", {
        event_id: event.id,
        event_type: event.type,
      });

      try {
        // workerの処理を直接実行
        const { ConnectWebhookHandler } = await import(
          "@features/payments/services/webhook/connect-webhook-handler"
        );
        const handler = await ConnectWebhookHandler.create();

        let _result: any = { success: true };

        // イベントタイプに応じて処理
        switch (event.type) {
          case "account.updated": {
            const accountObj = event.data.object as Stripe.Account;
            _result = await handler.handleAccountUpdated(accountObj);
            break;
          }
          case "account.application.deauthorized": {
            const applicationObj = event.data.object as Stripe.Application;
            _result = await handler.handleAccountApplicationDeauthorized(
              applicationObj,
              (event as any).account
            );
            break;
          }
          case "payout.paid": {
            const payout = event.data.object as Stripe.Payout;
            _result = await handler.handlePayoutPaid(payout);
            break;
          }
          case "payout.failed": {
            const payout = event.data.object as Stripe.Payout;
            _result = await handler.handlePayoutFailed(payout);
            break;
          }
          default: {
            connectLogger.info("Connect event ignored (unsupported type)", {
              type: event.type,
              event_id: event.id,
            });
          }
        }

        connectLogger.info("Connect webhook processed synchronously", {
          event_id: event.id,
          event_type: event.type,
          testMode: true,
          outcome: "success",
        });

        return NextResponse.json({
          received: true,
          eventId: event.id,
          eventType: event.type,
          testMode: true,
        });
      } catch (error) {
        connectLogger.error("Connect webhook synchronous processing failed", {
          event_id: event.id,
          event_type: event.type,
          error: error instanceof Error ? error.message : "Unknown error",
          outcome: "failure",
        });

        return createProblemResponse("INTERNAL_ERROR", {
          instance: "/api/webhooks/stripe-connect",
          detail: "Connect webhook processing failed in test mode",
        });
      }
    }

    // QStash に publish（完全なイベントデータを送信）
    const workerUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-connect-webhook`;
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
