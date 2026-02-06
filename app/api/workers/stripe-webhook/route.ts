/**
 * QStash Webhook Worker for Stripe Events
 *
 * このエンドポイントは：
 * 1. QStashからの署名を検証
 * 2. Stripeイベントのペイロードを受信（直接利用）
 * 3. 既存のWebhookハンドラーで処理
 *
 * QStash リトライ動作:
 * - 2xx: 成功（リトライなし）
 * - 489 + Upstash-NonRetryable-Error: リトライ不要、DLQへ送信
 * - その他: リトライ継続
 */

export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";
import type Stripe from "stripe";

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

interface QStashWebhookBody {
  event: Stripe.Event;
}

export async function POST(request: NextRequest) {
  ensureFeaturesRegistered();
  const startTime = Date.now();
  const correlationId = `qstash_${generateSecureUuid()}`;

  // 公式ヘッダーを取得
  const messageId = request.headers.get("Upstash-Message-Id");
  const retried = request.headers.get("Upstash-Retried");
  const retriedCount = retried ? parseInt(retried, 10) : 0;

  const qstashLogger = logger.withContext({
    category: "stripe_webhook",
    action: "qstash_worker_processing",
    actor_type: "webhook",
    correlation_id: correlationId,
    request_id: correlationId,
    path: "/api/workers/stripe-webhook",
    message_id: messageId,
    retried: retriedCount,
  });

  let stripeEvent: Stripe.Event | undefined;

  try {
    qstashLogger.info("QStash worker request received", {
      message_id: messageId,
      retried: retriedCount,
    });

    // QStash署名検証
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-webhook`;
    const signature = request.headers.get("Upstash-Signature");
    const rawBody = await request.text();

    if (!signature) {
      logSecurityEvent({
        type: "QSTASH_SIGNATURE_MISSING",
        severity: "MEDIUM",
        message: "Missing QStash signature",
        details: {
          correlation_id: correlationId,
          request_id: correlationId,
          message_id: messageId,
          path: "/api/workers/stripe-webhook",
        },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      qstashLogger.warn("Missing QStash signature - non-retryable", {
        message_id: messageId,
        outcome: "failure",
      });
      // 署名不正は再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Missing QStash signature", correlationId);
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
          message_id: messageId,
          signature_preview: signature.substring(0, 20) + "...",
          path: "/api/workers/stripe-webhook",
        },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      qstashLogger.warn("Invalid QStash signature - non-retryable", {
        message_id: messageId,
        outcome: "failure",
      });
      // 署名不正は再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Invalid QStash signature", correlationId);
    }

    qstashLogger.info("QStash signature verified", {
      message_id: messageId,
    });

    // リクエストボディのパース
    let webhookBody: QStashWebhookBody;
    try {
      webhookBody = JSON.parse(rawBody);
    } catch {
      qstashLogger.warn("Invalid JSON body - non-retryable", {
        message_id: messageId,
        outcome: "failure",
      });
      // JSONパースエラーは再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Invalid JSON body", correlationId);
    }

    stripeEvent = webhookBody.event;

    if (!stripeEvent?.id || !stripeEvent?.type) {
      qstashLogger.warn("Missing or invalid event data - non-retryable", {
        message_id: messageId,
        has_event: !!stripeEvent,
        event_id: stripeEvent?.id,
        event_type: stripeEvent?.type,
        outcome: "failure",
      });
      // ペイロード不正は再送しても治らないため 489 (DLQへ)
      return nonRetryableError("Missing or invalid event data", correlationId);
    }

    qstashLogger.debug("Processing received Stripe event", {
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      message_id: messageId,
    });

    // 既存のWebhookハンドラーで処理
    const handler = new StripeWebhookEventHandler();
    const processingResult = await handler.handleEvent(stripeEvent);

    const processingTime = Date.now() - startTime;

    // ハンドラが失敗を返した場合の処理
    if (processingResult && processingResult.success === false) {
      const isTerminal = processingResult.meta?.terminal ?? !processingResult.error.retryable;
      const reason = processingResult.meta?.reason;
      const error = processingResult.error.userMessage || processingResult.error.message;
      const errorCode = processingResult.error.code;
      const retryable = processingResult.error.retryable;

      if (isTerminal) {
        // terminal=true の場合、reasonで区別
        // - "duplicate" / "already_processed" → 正常系として 204 ACK
        // - その他 → 要調査なので 489 (DLQへ)
        const isDuplicateOrProcessed = reason === "duplicate" || reason === "already_processed";

        qstashLogger.warn("Terminal webhook processing failure", {
          message_id: messageId,
          event_id: stripeEvent?.id,
          event_type: stripeEvent?.type,
          processing_time_ms: processingTime,
          reason,
          error,
          error_code: errorCode,
          retryable,
          retried: retriedCount,
          action: isDuplicateOrProcessed ? "ack_duplicate" : "send_to_dlq",
          outcome: "failure",
        });

        if (isDuplicateOrProcessed) {
          // 重複/処理済みは正常終了扱い
          return new NextResponse(null, {
            status: 204,
            headers: { "X-Correlation-ID": correlationId },
          });
        }

        // 要調査の失敗はDLQへ
        return nonRetryableError(`Terminal failure: ${reason || error}`, correlationId);
      }

      // retryable (再試行させる): 500 を返す
      qstashLogger.warn("Retryable webhook processing failure", {
        message_id: messageId,
        event_id: stripeEvent?.id,
        event_type: stripeEvent?.type,
        processing_time_ms: processingTime,
        reason,
        error,
        error_code: errorCode,
        retryable,
        retried: retriedCount,
        outcome: "failure",
      });
      return retryableError(`Processing failed: ${error}`, correlationId);
    }

    qstashLogger.info("QStash webhook processing completed", {
      event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      message_id: messageId,
      success: processingResult?.success ?? true,
      processing_time_ms: processingTime,
      payment_id: processingResult.meta?.paymentId || undefined,
      retried: retriedCount,
      outcome: "success",
    });

    return new NextResponse(null, {
      status: 204,
      headers: { "X-Correlation-ID": correlationId },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    qstashLogger.error("QStash worker unexpected error - retryable", {
      message_id: messageId,
      event_id: stripeEvent?.id,
      event_type: stripeEvent?.type,
      processing_time_ms: processingTime,
      retried: retriedCount,
      error: error instanceof Error ? error.message : String(error),
      outcome: "failure",
    });
    // 予期しないエラーはリトライ可能として 500
    return retryableError("Worker failed to process event", correlationId);
  }
}
