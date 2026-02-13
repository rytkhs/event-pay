/**
 * QStash Webhook Worker for Stripe Connect Events
 *
 * QStash リトライ動作:
 * - 2xx: 成功（リトライなし）
 * - 489 + Upstash-NonRetryable-Error: リトライ不要、DLQへ送信
 * - その他: リトライ継続
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";
import Stripe from "stripe";

import { okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import { getEnv } from "@core/utils/cloudflare-env";
import { getClientIP } from "@core/utils/ip-detection";

import { ConnectWebhookHandler } from "@features/stripe-connect/server";
import type { ConnectWebhookResult } from "@features/stripe-connect/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

const getQstashReceiver = () => {
  const currentKey = getEnv().QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = getEnv().QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QStash signing keys are required");
  }
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
};

/**
 * QStash向け非リトライエラーレスポンス
 * 489 + Upstash-NonRetryable-Error ヘッダーでDLQへ送信
 */
function nonRetryableError(message: string, correlationId?: string): NextResponse {
  return new NextResponse(message, {
    status: 489,
    headers: {
      "Upstash-NonRetryable-Error": "true",
      ...(correlationId ? { "X-Correlation-ID": correlationId } : {}),
    },
  });
}

/**
 * QStash向けリトライ可能エラーレスポンス
 */
function retryableError(message: string, correlationId?: string): NextResponse {
  return new NextResponse(message, {
    status: 500,
    headers: correlationId ? { "X-Correlation-ID": correlationId } : {},
  });
}

export async function POST(request: NextRequest) {
  ensureFeaturesRegistered();
  const start = Date.now();
  const corr = `qstash_connect_${generateSecureUuid()}`;

  // 公式ヘッダーを取得
  const messageId = request.headers.get("Upstash-Message-Id");
  const retried = request.headers.get("Upstash-Retried");
  const retriedCount = retried ? parseInt(retried, 10) : 0;

  const connectLogger = logger.withContext({
    category: "stripe_webhook",
    action: "stripe_connect_webhook_worker",
    actor_type: "webhook",
    correlation_id: corr,
    request_id: corr,
    message_id: messageId,
    retried: retriedCount,
  });

  try {
    connectLogger.info("Connect QStash worker request received", {
      message_id: messageId,
      retried: retriedCount,
    });

    const signature = request.headers.get("Upstash-Signature");
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-connect-webhook`;
    const rawBody = await request.text();

    if (!signature) {
      connectLogger.warn("Missing QStash signature (connect) - non-retryable", {
        ip: getClientIP(request),
        message_id: messageId,
        outcome: "failure",
      });
      // 署名不正は再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Missing QStash signature", corr);
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({ signature, body: rawBody, url });
    if (!isValid) {
      connectLogger.warn("Invalid QStash signature (connect) - non-retryable", {
        ip: getClientIP(request),
        message_id: messageId,
        outcome: "failure",
      });
      // 署名不正は再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Invalid QStash signature", corr);
    }

    let parsed: { event: Stripe.Event };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      connectLogger.warn("Invalid JSON body (connect) - non-retryable", {
        message_id: messageId,
        outcome: "failure",
      });
      // JSONパースエラーは再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Invalid JSON body", corr);
    }

    const { event } = parsed;
    if (!event?.id || !event?.type) {
      connectLogger.warn(
        "Missing or invalid event in Connect QStash webhook body - non-retryable",
        {
          has_event: !!event,
          event_id: event?.id,
          event_type: event?.type,
          message_id: messageId,
          outcome: "failure",
        }
      );
      // ペイロード不正は再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Missing or invalid event data", corr);
    }

    connectLogger.debug("Processing received Connect event", {
      event_id: event.id,
      event_type: event.type,
      message_id: messageId,
    });

    // 既存Connectハンドラに委譲
    const handler = await ConnectWebhookHandler.create();
    let processingResult: ConnectWebhookResult = okResult();
    switch (event.type) {
      case "account.updated": {
        const accountObj = event.data.object as Stripe.Account;
        processingResult = await handler.handleAccountUpdated(accountObj);
        break;
      }
      case "account.application.deauthorized": {
        const applicationObj = event.data.object as Stripe.Application;
        processingResult = await handler.handleAccountApplicationDeauthorized(
          applicationObj,
          event.account ?? undefined
        );
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        processingResult = await handler.handlePayoutPaid(payout);
        break;
      }
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        processingResult = await handler.handlePayoutFailed(payout);
        break;
      }
      default: {
        connectLogger.info("Connect event ignored (unsupported type)", {
          type: event.type,
          event_id: event.id,
          message_id: messageId,
        });
        processingResult = okResult(undefined, { reason: "unsupported_event" });
      }
    }

    if (!processingResult.success) {
      const ms = Date.now() - start;
      const isTerminal = processingResult.meta?.terminal ?? !processingResult.error.retryable;
      const reason = processingResult.meta?.reason;
      const error = processingResult.error.userMessage || processingResult.error.message;
      const errorCode = processingResult.error.code;
      const retryable = processingResult.error.retryable;

      if (isTerminal) {
        connectLogger.warn("Terminal connect webhook processing failure", {
          message_id: messageId,
          event_id: event.id,
          type: event.type,
          reason,
          error,
          error_code: errorCode,
          retryable,
          ms,
          retried: retriedCount,
          action: "send_to_dlq",
          outcome: "failure",
        });

        // 恒久的な失敗は再試行せずDLQへ
        return nonRetryableError(`Terminal failure: ${reason || error}`, corr);
      }

      // retryable (再試行させる): 500 を返す
      connectLogger.warn("Retryable connect webhook processing failure", {
        message_id: messageId,
        event_id: event.id,
        type: event.type,
        reason,
        error,
        error_code: errorCode,
        retryable,
        ms,
        retried: retriedCount,
        outcome: "failure",
      });
      return retryableError(`Processing failed: ${error}`, corr);
    }

    const ms = Date.now() - start;
    connectLogger.info("Connect QStash worker processed", {
      message_id: messageId,
      event_id: event.id,
      type: event.type,
      ms,
      retried: retriedCount,
      outcome: "success",
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const ms = Date.now() - start;
    connectLogger.error("Connect QStash worker unexpected error - retryable", {
      message_id: messageId,
      processing_time_ms: ms,
      retried: retriedCount,
      error: error instanceof Error ? error.message : String(error),
      outcome: "failure",
    });
    // 予期しないエラーはリトライ可能として 500
    return retryableError("Worker failed to process connect event", corr);
  }
}
