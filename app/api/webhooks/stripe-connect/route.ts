/**
 * Stripe Connect Webhook エンドポイント
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
// Connect 専用ハンドラは非同期ワーカー側で使用するため、このエンドポイントでは不要
// import { ConnectWebhookHandler } from "@/lib/services/webhook/connect-webhook-handler";
import {
  SupabaseWebhookIdempotencyService,
} from "@/lib/services/webhook/webhook-idempotency";
import { StripeWebhookSignatureVerifier } from "@/lib/services/webhook/webhook-signature-verifier";
import { SecurityReporterImpl } from "@/lib/security/security-reporter.impl";
import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import { AnomalyDetectorImpl } from "@/lib/security/anomaly-detector";
import { getClientIP } from "@/lib/utils/ip-detection";
import { shouldEnforceStripeWebhookIpCheck, isStripeWebhookIpAllowed } from "@/lib/security/stripe-ip-allowlist";

const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET!;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Webhookは常に動的処理

export async function POST(request: NextRequest) {
  const _clientIP = getClientIP(request);
  let enqueued = false;

  try {
    // 本番のみ: Stripe Webhook 送信元 IP の許可リスト検証
    if (shouldEnforceStripeWebhookIpCheck()) {
      const clientIp = _clientIP;
      const allowed = await isStripeWebhookIpAllowed(clientIp);
      if (!allowed) {
        const auditor = new SecurityAuditorImpl();
        const anomalyDetector = new AnomalyDetectorImpl(auditor);
        const securityReporter = new SecurityReporterImpl(auditor, anomalyDetector);
        await securityReporter.logSuspiciousActivity({
          type: "webhook_ip_not_allowed",
          details: { clientIp },
          ip: clientIp,
          userAgent: request.headers.get("user-agent") || undefined,
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // 共通の署名検証ロジックを使用
    const auditor = new SecurityAuditorImpl();
    const anomalyDetector = new AnomalyDetectorImpl(auditor);
    const securityReporter = new SecurityReporterImpl(auditor, anomalyDetector);
    const verifier = new StripeWebhookSignatureVerifier(stripe, webhookSecret, securityReporter);

    const verification = await verifier.verifySignature({ payload, signature });
    if (!verification.isValid || !verification.event) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    const event: Stripe.Event = verification.event;

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
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

// GETメソッドは許可しない
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
