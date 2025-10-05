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
import { logSecurityEvent } from "@core/security/security-logger";
import {
  shouldEnforceStripeWebhookIpCheck,
  isStripeWebhookIpAllowed,
} from "@core/security/stripe-ip-allowlist";
import { getWebhookSecrets, stripe as sharedStripe } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";

import { StripeWebhookEventHandler } from "@features/payments/services/webhook/webhook-event-handler";
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
    if (shouldEnforceStripeWebhookIpCheck()) {
      const allowed = await isStripeWebhookIpAllowed(clientIP);
      if (!allowed) {
        logSecurityEvent({
          type: "WEBHOOK_IP_REJECTED",
          severity: "MEDIUM",
          message: "Webhook request from unauthorized IP",
          details: {
            request_id: requestId,
            path: "/api/webhooks/stripe",
          },
          userAgent: request.headers.get("user-agent") || undefined,
          ip: clientIP,
          timestamp: new Date(),
        });
        return createProblemResponse("FORBIDDEN", {
          instance: "/api/webhooks/stripe",
          detail: "IP address not authorized for webhook access",
          correlation_id: requestId,
        });
      }
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      logSecurityEvent({
        type: "WEBHOOK_SIGNATURE_MISSING",
        severity: "MEDIUM",
        message: "Missing Stripe signature header",
        details: { request_id: requestId, path: "/api/webhooks/stripe" },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: clientIP,
        timestamp: new Date(),
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe",
        detail: "Missing Stripe signature",
        correlation_id: requestId,
      });
    }

    // Stripe署名検証
    const signatureVerifier = new StripeWebhookSignatureVerifier(sharedStripe, getWebhookSecrets());
    const verificationResult = await signatureVerifier.verifySignature({
      payload,
      signature,
    });

    if (!verificationResult.isValid || !verificationResult.event) {
      logSecurityEvent({
        type: "WEBHOOK_SIGNATURE_INVALID",
        severity: "MEDIUM",
        message: "Webhook signature verification failed",
        details: { request_id: requestId, path: "/api/webhooks/stripe" },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: clientIP,
        timestamp: new Date(),
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe",
        detail: "Invalid webhook signature",
        correlation_id: requestId,
      });
    }

    const event = verificationResult.event;

    logger.info("Webhook signature verified", {
      event_id: event.id,
      event_type: event.type,
      request_id: requestId,
      tag: "webhookProcessing",
    });

    // テスト環境での同期処理モード（E2Eテスト用）
    // SKIP_QSTASH_IN_TEST=true の場合、QStashをスキップして直接処理
    const shouldProcessSync = process.env.SKIP_QSTASH_IN_TEST === "true";

    if (shouldProcessSync) {
      logger.info("Test mode: Processing webhook synchronously (QStash skipped)", {
        event_id: event.id,
        event_type: event.type,
        request_id: requestId,
        tag: "webhook-test-mode",
      });

      try {
        // workerの処理を直接実行
        const handler = new StripeWebhookEventHandler();
        const result = await handler.handleEvent(event);

        const processingTime = Date.now() - startTime;

        logger.info("Webhook processed synchronously", {
          event_id: event.id,
          event_type: event.type,
          success: result.success,
          processing_time_ms: processingTime,
          request_id: requestId,
          tag: "webhook-test-mode",
        });

        return NextResponse.json({
          received: true,
          eventId: event.id,
          eventType: event.type,
          processed: result.success,
          testMode: true,
          requestId,
          processingTimeMs: processingTime,
        });
      } catch (error) {
        logger.error("Webhook synchronous processing failed", {
          event_id: event.id,
          event_type: event.type,
          error: error instanceof Error ? error.message : "Unknown error",
          request_id: requestId,
          tag: "webhook-test-mode",
        });

        return createProblemResponse("INTERNAL_ERROR", {
          instance: "/api/webhooks/stripe",
          detail: "Webhook processing failed in test mode",
          correlation_id: requestId,
        });
      }
    }

    // 本番環境: QStashに転送（完全なイベントデータを送信）
    const workerUrl = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/stripe-webhook`;
    // const workerUrl = "https://de438ee16cfb.ngrok-free.app/api/workers/stripe-webhook";

    // 完全なイベントデータを送信（イベント再取得を不要にする）
    const qstashBody = {
      event: event, // 検証済みの完全なStripe.Eventオブジェクト
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
    const errorContext = {
      tag: "webhook-error",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      processing_time_ms: processingTime,
      request_id: requestId,
      stack: error instanceof Error ? error.stack : undefined,
    };

    // エラーの種類による詳細分類
    if (error && typeof error === "object") {
      const errObj = error as any;

      // Stripe署名検証エラー
      if (
        errObj.message?.includes("signature") ||
        errObj.message?.includes("webhook") ||
        errObj.name === "StripeSignatureVerificationError"
      ) {
        logger.warn("Stripe signature verification failed", {
          ...errorContext,
          error_classification: "security_error",
          severity: "high",
        });
        return createProblemResponse("INVALID_REQUEST", {
          instance: "/api/webhooks/stripe",
          detail: "Webhook signature verification failed",
          correlation_id: requestId,
        });
      }

      // QStash接続・送信エラー
      if (
        errObj.message?.includes("qstash") ||
        errObj.message?.includes("upstash") ||
        errObj.message?.includes("publish")
      ) {
        logger.error("QStash forwarding failed", {
          ...errorContext,
          error_classification: "external_service_error",
          severity: "critical", // webhook転送失敗は重大
          qstash_error: true,
        });
        return createProblemResponse("EXTERNAL_SERVICE_ERROR", {
          instance: "/api/webhooks/stripe",
          detail: "Webhook forwarding to queue failed",
          correlation_id: requestId,
          retryable: true,
        });
      }

      // ネットワーク・接続エラー
      if (
        errObj.message?.includes("fetch") ||
        errObj.message?.includes("network") ||
        errObj.message?.includes("timeout") ||
        errObj.code === "ENOTFOUND" ||
        errObj.code === "ECONNRESET"
      ) {
        logger.warn("Network error in webhook processing", {
          ...errorContext,
          error_classification: "network_error",
          severity: "medium",
          network_error_code: errObj.code,
        });
        return createProblemResponse("EXTERNAL_SERVICE_ERROR", {
          instance: "/api/webhooks/stripe",
          detail: "Network connection failed",
          correlation_id: requestId,
          retryable: true,
        });
      }

      // JSON解析エラー
      if (
        errObj instanceof SyntaxError ||
        errObj.message?.includes("JSON") ||
        errObj.name === "SyntaxError"
      ) {
        logger.warn("Invalid JSON in webhook request", {
          ...errorContext,
          error_classification: "client_error",
          severity: "low",
        });
        return createProblemResponse("INVALID_REQUEST", {
          instance: "/api/webhooks/stripe",
          detail: "Invalid JSON payload",
          correlation_id: requestId,
        });
      }

      // 環境変数・設定エラー
      if (
        errObj.message?.includes("QSTASH_TOKEN") ||
        errObj.message?.includes("environment") ||
        errObj.message?.includes("configuration")
      ) {
        logger.error("Configuration error in webhook processing", {
          ...errorContext,
          error_classification: "config_error",
          severity: "critical",
        });
        return createProblemResponse("INTERNAL_ERROR", {
          instance: "/api/webhooks/stripe",
          detail: "Configuration error",
          correlation_id: requestId,
        });
      }

      // IP制限エラー
      if (
        errObj.message?.includes("IP") ||
        errObj.message?.includes("unauthorized") ||
        errObj.message?.includes("forbidden")
      ) {
        logger.warn("IP restriction or authorization failed", {
          ...errorContext,
          error_classification: "security_error",
          severity: "medium",
        });
        return createProblemResponse("FORBIDDEN", {
          instance: "/api/webhooks/stripe",
          detail: "Access denied",
          correlation_id: requestId,
        });
      }
    }

    // その他の予期しないエラー（最も重大として扱う）
    logger.error("Unexpected error in webhook processing", {
      ...errorContext,
      error_classification: "system_error",
      severity: "critical",
      requires_investigation: true,
    });

    // 失敗時はProblem Detailsで500を返し、Stripeにリトライを促す
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/webhooks/stripe",
      detail: "Unexpected webhook processing failure",
      correlation_id: requestId,
      retryable: true,
    });
  }
}
