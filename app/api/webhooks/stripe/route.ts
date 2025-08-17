import { NextRequest, NextResponse } from 'next/server';
// Stripe 型は共有クライアント経由で利用するため未使用
import { stripe as sharedStripe, getWebhookSecret } from '@/lib/stripe/client';
import { StripeWebhookSignatureVerifier } from '@/lib/services/webhook/webhook-signature-verifier';
// import { StripeWebhookEventHandler } from '@/lib/services/webhook/webhook-event-handler';
import {
  SupabaseWebhookIdempotencyService,
} from '@/lib/services/webhook/webhook-idempotency';
import { SecurityReporterImpl } from '@/lib/security/security-reporter.impl';
import { SecurityAuditorImpl } from '@/lib/security/security-auditor.impl';
import { AnomalyDetectorImpl } from '@/lib/security/anomaly-detector';
// Rate limiting middleware intentionally not used on this webhook per Stripe best practice (429 triggers unnecessary retries)
import type { SecurityReporter } from '@/lib/security/security-reporter.types';
import type { WebhookProcessingResult } from '@/lib/services/webhook';
import { getClientIP } from '@/lib/utils/ip-detection';
import { shouldEnforceStripeWebhookIpCheck, isStripeWebhookIpAllowed } from '@/lib/security/stripe-ip-allowlist';
import { logger } from '@/lib/logging/app-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Webhookは常に動的処理

function createServices() {
  const stripe = sharedStripe;

  const auditor = new SecurityAuditorImpl();
  const anomalyDetector = new AnomalyDetectorImpl(auditor);
  const securityReporter = new SecurityReporterImpl(auditor, anomalyDetector);
  const signatureVerifier = new StripeWebhookSignatureVerifier(
    stripe,
    getWebhookSecret(),
    securityReporter
  );
  const idempotencyService = new SupabaseWebhookIdempotencyService<WebhookProcessingResult>();

  return { securityReporter, signatureVerifier, idempotencyService };
}

export async function POST(request: NextRequest) {
  let securityReporter: SecurityReporter | undefined;
  let enqueued = false;
  const requestId = request.headers.get('x-request-id') || 'unknown';
  const webhookLogger = logger.withContext({
    request_id: requestId,
    path: request.nextUrl.pathname,
    tag: 'webhookProcessing'
  });

  webhookLogger.info('Webhook request received');

  try {
    const { securityReporter: sr, signatureVerifier, idempotencyService } = createServices();
    securityReporter = sr;

    // 本番のみ: Stripe Webhook 送信元 IP の許可リスト検証
    if (shouldEnforceStripeWebhookIpCheck()) {
      const clientIp = getClientIP(request);
      const allowed = await isStripeWebhookIpAllowed(clientIp);
      if (!allowed) {
        await securityReporter.logSuspiciousActivity({
          type: 'webhook_ip_not_allowed',
          details: { clientIp },
          ip: clientIp,
          userAgent: request.headers.get('user-agent') || undefined,
        });
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // リクエストボディとヘッダーの取得
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      webhookLogger.warn('Webhook signature missing');
      await securityReporter.logSuspiciousActivity({
        type: 'webhook_missing_signature',
        details: {
          hasPayload: !!payload,
          payloadLength: payload.length
        },
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined
      });

      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // タイムスタンプは検証で t= を使用するため、ここでは現在時刻を付与（ログ用途のみ）
    const timestamp = Math.floor(Date.now() / 1000);

    // 署名検証
    webhookLogger.debug('Starting signature verification');
    const verificationResult = await signatureVerifier.verifySignature({
      payload,
      signature,
      fallbackTimestamp: timestamp
    });

    if (!verificationResult.isValid || !verificationResult.event) {
      webhookLogger.warn('Webhook signature verification failed');
      // 外部公開用のエラーメッセージは統一し、詳細はセキュリティログに依存
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 400 }
      );
    }

    const event = verificationResult.event;

    webhookLogger.info('Webhook signature verified', {
      event_id: event.id,
      event_type: event.type
    });

    // 受信イベントを pending として即時エンキュー（最小処理）
    // data.object.id はタイプにより存在しない場合があるため、あれば保存
    const objectId: string | null = ((): string | null => {
      const data: unknown = (event as unknown as { data?: unknown }).data;
      if (!data || typeof data !== 'object') return null;
      const obj: unknown = (data as { object?: unknown }).object;
      if (!obj || typeof obj !== 'object') return null;
      const idVal = (obj as { id?: unknown }).id;
      return typeof idVal === 'string' && idVal.length > 0 ? idVal : null;
    })();

    webhookLogger.debug('Enqueueing webhook event for processing', {
      event_id: event.id,
      event_type: event.type,
      object_id: objectId
    });

    await idempotencyService.enqueueEventForProcessing(
      event.id,
      event.type,
      {
        stripe_account_id: (event as unknown as { account?: string | null }).account ?? null,
        stripe_event_created: (event as { created?: number }).created ?? Math.floor(Date.now() / 1000),
        object_id: objectId,
      }
    );
    enqueued = true;

    webhookLogger.info('Webhook event enqueued successfully', {
      event_id: event.id,
      event_type: event.type,
      tag: 'enqueueSucceeded'
    });

    // 非同期処理は別ジョブに委譲するため、ここでは即 200 を返す
    // 参考: https://docs.stripe.com/webhooks#handle-events-asynchronously
    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      enqueued: true
    });

  } catch (error) {
    // 予期しないエラーのログ
    try {
      if (securityReporter) {
        await securityReporter.logSuspiciousActivity({
          type: 'webhook_unexpected_error',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          },
          ip: getClientIP(request)
        });
      }
    } catch (_logError) {
      // ログ失敗時は黙って継続
    }

    // フォールバックで構造化ログ出力
    logger.error('Webhook route error', {
      tag: 'webhookRouteError',
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
      enqueued
    });

    // enqueue 成功後に発生した例外は 200 を返して Stripe の不要なリトライを防止
    if (enqueued) {
      return NextResponse.json({ received: true, enqueued: true });
    }

    // enqueue 前に失敗している場合は Stripe の自動リトライを促す
    try {
      if (securityReporter) {
        const { idempotencyService: dlqSvc } = createServices();
        if (
          typeof error === 'object' &&
          error !== null &&
          (error as { eventId?: string }).eventId &&
          (error as { eventType?: string }).eventType
        ) {
          await dlqSvc.markEventFailed(
            (error as { eventId: string }).eventId,
            (error as { eventType: string }).eventType,
            error instanceof Error ? error.message : 'unexpected_error'
          );
        }
      }
    } catch { /* noop */ }

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// GETメソッドは許可しない
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

// その他のHTTPメソッドも許可しない
export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
