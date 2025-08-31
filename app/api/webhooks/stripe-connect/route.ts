/**
 * Stripe Connect Webhook エンドポイント
 */

import { NextRequest, NextResponse } from "next/server";
import { createProblemResponse } from "@/lib/api/problem-details";
import Stripe from "stripe";
import { stripe, getConnectWebhookSecrets } from "@/lib/stripe/client";
import {
  SupabaseWebhookIdempotencyService,
} from "@/lib/services/webhook/webhook-idempotency";
import { StripeWebhookSignatureVerifier } from "@/lib/services/webhook/webhook-signature-verifier";
import { getClientIP } from "@/lib/utils/ip-detection";
import { shouldEnforceStripeWebhookIpCheck, isStripeWebhookIpAllowed } from "@/lib/security/stripe-ip-allowlist";
import { logger } from '@/lib/logging/app-logger';
import { generateSecureUuid } from '@/lib/security/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Webhookは常に動的処理

export async function POST(request: NextRequest) {
  const _clientIP = getClientIP(request);
  let enqueued = false;
  const requestId = request.headers.get('x-request-id') || generateSecureUuid();
  const connectLogger = logger.withContext({
    request_id: requestId,
    path: request.nextUrl.pathname,
    tag: 'connectWebhookProcessing'
  });

  connectLogger.info('Connect webhook request received');

  try {
    // 本番のみ: Stripe Webhook 送信元 IP の許可リスト検証
    if (shouldEnforceStripeWebhookIpCheck()) {
      const clientIp = _clientIP;
      const allowed = await isStripeWebhookIpAllowed(clientIp);
      if (!allowed) {
        // Security logging replaced with standard logger
        logger.warn('Webhook IP not allowed', {
          clientIp,
          userAgent: request.headers.get("user-agent") || undefined
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
      connectLogger.warn('Connect webhook signature missing');
      return createProblemResponse("MISSING_PARAMETER", {
        instance: "/api/webhooks/stripe-connect",
        detail: "Missing signature",
      });
    }

    // Webhookシークレットはリクエスト単位で取得（ローテーション/テスト環境切替に対応）
    const webhookSecrets = getConnectWebhookSecrets();

    // 共通の署名検証ロジックを使用
    // Security logging replaced with standard logger
    const verifier = new StripeWebhookSignatureVerifier(stripe, webhookSecrets);

    connectLogger.debug('Starting Connect webhook signature verification');
    const verification = await verifier.verifySignature({ payload, signature });
    if (!verification.isValid || !verification.event) {
      connectLogger.warn('Connect webhook signature verification failed');
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/webhooks/stripe-connect",
        detail: "Invalid signature",
      });
    }
    const event: Stripe.Event = verification.event;

    connectLogger.info('Connect webhook signature verified', {
      event_id: event.id,
      event_type: event.type
    });

    // 受信イベントを pending として即時エンキュー（Connect用）
    const idempotency = new SupabaseWebhookIdempotencyService();
    const objectId: string | null = ((): string | null => {
      const data: unknown = (event as unknown as { data?: unknown }).data;
      if (!data || typeof data !== 'object') return null;
      const obj: unknown = (data as { object?: unknown }).object;
      if (!obj || typeof obj !== 'object') return null;
      const idVal = (obj as { id?: unknown }).id;
      return typeof idVal === 'string' && idVal.length > 0 ? idVal : null;
    })();

    connectLogger.debug('Enqueueing Connect webhook event for processing', {
      event_id: event.id,
      event_type: event.type,
      object_id: objectId
    });

    await idempotency.enqueueEventForProcessing(
      event.id,
      event.type,
      {
        stripe_account_id: (event as unknown as { account?: string | null }).account ?? null,
        stripe_event_created: (event as { created?: number }).created ?? Math.floor(Date.now() / 1000),
        object_id: objectId,
      }
    );
    enqueued = true;

    connectLogger.info('Connect webhook event enqueued successfully', {
      event_id: event.id,
      event_type: event.type,
      tag: 'enqueueSucceeded'
    });

    // 非同期処理は別ジョブに委譲して即ACK
    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      enqueued: true
    });

  } catch (_error) {
    // enqueue 後の例外は 200 を返し Stripe の不要なリトライを防止
    if (enqueued) {
      return NextResponse.json({ received: true, enqueued: true });
    }
    // enqueue 前に失敗している場合は 500 を返し Stripe に再送してもらう
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/webhooks/stripe-connect",
      detail: "Webhook handler failed",
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
