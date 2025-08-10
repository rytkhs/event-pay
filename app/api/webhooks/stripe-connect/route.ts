/**
 * Stripe Connect Webhook エンドポイント
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { ConnectWebhookHandler } from "@/lib/services/webhook/connect-webhook-handler";
import { StripeWebhookSignatureVerifier } from "@/lib/services/webhook/webhook-signature-verifier";
import { SecurityReporterImpl } from "@/lib/security/security-reporter.impl";
import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import { AnomalyDetectorImpl } from "@/lib/security/anomaly-detector";
import { handleRateLimit } from "@/lib/rate-limit-middleware";
import { getClientIP } from "@/lib/utils/ip-detection";

const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET!;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Webhookは常に動的処理

export async function POST(request: NextRequest) {
  const _clientIP = getClientIP(request);

  try {
    // レート制限チェック
    const rateLimited = await handleRateLimit(
      request,
      {
        windowMs: 60 * 1000, // 1分
        maxAttempts: 1000,
        blockDurationMs: 1000
      },
      "webhook:stripe-connect"
    );

    if (rateLimited) {
      return rateLimited;
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

    // Webhookハンドラーを初期化（監査付きadmin client使用）
    const webhookHandler = await ConnectWebhookHandler.create();

    // イベントタイプに応じて処理
    switch (event.type) {
      case "account.updated":
        await webhookHandler.handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      default:
        break;
    }

    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type
    });

  } catch (_error) {

    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

// GETメソッドは許可しない
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
