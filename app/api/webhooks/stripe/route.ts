import { NextRequest, NextResponse } from 'next/server';
// Stripe 型は共有クライアント経由で利用するため未使用
import { stripe as sharedStripe, getWebhookSecret } from '@/lib/stripe/client';
import { StripeWebhookSignatureVerifier } from '@/lib/services/webhook/webhook-signature-verifier';
import { StripeWebhookEventHandler } from '@/lib/services/webhook/webhook-event-handler';
import {
  SupabaseWebhookIdempotencyService,
  IdempotentWebhookProcessor
} from '@/lib/services/webhook/webhook-idempotency';
import { SecurityReporterImpl } from '@/lib/security/security-reporter.impl';
import { SecurityAuditorImpl } from '@/lib/security/security-auditor.impl';
import { AnomalyDetectorImpl } from '@/lib/security/anomaly-detector';
import { handleRateLimit } from '@/lib/rate-limit-middleware';
import type { SecurityReporter } from '@/lib/security/security-reporter.types';
import type { WebhookProcessingResult } from '@/lib/services/webhook';
import { getClientIP } from '@/lib/utils/ip-detection';

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
  const eventHandler = new StripeWebhookEventHandler(securityReporter);
  const idempotencyService = new SupabaseWebhookIdempotencyService<WebhookProcessingResult>();
  const idempotentProcessor = new IdempotentWebhookProcessor<WebhookProcessingResult>(idempotencyService);

  return { securityReporter, signatureVerifier, eventHandler, idempotentProcessor, idempotencyService };
}

export async function POST(request: NextRequest) {
  let securityReporter: SecurityReporter | undefined;
  try {
    const { securityReporter: sr, signatureVerifier, eventHandler, idempotentProcessor, idempotencyService } = createServices();
    securityReporter = sr;
    const rateLimited = await handleRateLimit(
      request,
      {
        windowMs: 1000,
        maxAttempts: 20,
        blockDurationMs: 1000
      },
      "webhook:stripe"
    );

    if (rateLimited) {
      await securityReporter.logSuspiciousActivity({
        type: 'webhook_rate_limit_exceeded',
        details: {
          retryAfter: Number(rateLimited.headers.get('Retry-After') || '1')
        },
        ip: getClientIP(request)
      });
      return rateLimited;
    }

    // リクエストボディとヘッダーの取得
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
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
    const verificationResult = await signatureVerifier.verifySignature({
      payload,
      signature,
      fallbackTimestamp: timestamp
    });

    if (!verificationResult.isValid || !verificationResult.event) {
      // 外部公開用のエラーメッセージは統一し、詳細はセキュリティログに依存
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 400 }
      );
    }

    const event = verificationResult.event;

    // 冪等性を保証してイベントを処理
    const processingResult = await idempotentProcessor.processWithIdempotency(
      event.id,
      event.type,
      async () => {
        return await eventHandler.handleEvent(event);
      },
      {
        shouldMark: (r) => {
          const res = r as WebhookProcessingResult;
          return res.success === true || res.terminal === true;
        }
      }
    );

    // 処理結果のログ
    // processingSuccess は、すでに処理済みかつ結果未反映の場合は未定(undefined)にする
    const processingSuccessValue =
      processingResult.wasAlreadyProcessed && !processingResult.result
        ? undefined
        : (processingResult.result?.success ?? false);

    await securityReporter.logSecurityEvent({
      type: 'webhook_processed',
      details: {
        eventId: event.id,
        eventType: event.type,
        wasAlreadyProcessed: processingResult.wasAlreadyProcessed,
        processingSuccess: processingSuccessValue
      }
    });

    // 処理が失敗した場合
    const successFlag: boolean = processingResult.result?.success ?? false;
    if (!successFlag) {
      // 終端エラーの場合はACK（Stripe再試行を停止）
      if (processingResult.result?.terminal === true) {
        return NextResponse.json({
          received: true,
          eventId: event.id,
          eventType: event.type,
          wasAlreadyProcessed: processingResult.wasAlreadyProcessed,
          terminal: true,
          reason: processingResult.result?.reason,
        });
      }

      // ロック未取得・結果未反映の可能性がある場合は短時間ポーリングして結果を待つ
      if (processingResult.wasAlreadyProcessed) {
        // ポーリングの設定は環境変数で調整可能
        const maxWaitMs = Number.parseInt(process.env.WEBHOOK_RESULT_POLL_MAX_MS || "2000", 10);
        const intervalMs = Number.parseInt(process.env.WEBHOOK_RESULT_POLL_INTERVAL_MS || "100", 10);
        const start = Date.now();
        let polled: WebhookProcessingResult | null = null;
        do {
          polled = await idempotencyService.getProcessingResult(event.id);
          const polledSuccess = polled?.success;
          if (polled?.terminal === true) {
            return NextResponse.json({
              received: true,
              eventId: event.id,
              eventType: event.type,
              wasAlreadyProcessed: true,
              terminal: true,
              reason: polled.reason,
            });
          }
          if (typeof polledSuccess === 'boolean') {
            if (polledSuccess === true) {
              // 他ワーカーが成功で確定させた
              return NextResponse.json({
                received: true,
                eventId: event.id,
                eventType: event.type,
                wasAlreadyProcessed: true,
              });
            }
            // 失敗が確定
            break;
          }
          await new Promise((r) => setTimeout(r, intervalMs));
        } while (Date.now() - start < maxWaitMs);

        // ここまで来たら結果未反映または失敗。未反映の場合は 409 で Stripe に再試行させる
        if (!polled || typeof polled.success !== 'boolean') {
          await securityReporter.logSuspiciousActivity({
            type: 'webhook_processing_in_progress',
            details: { eventId: event.id, eventType: event.type, waitedMs: Date.now() - start },
          });
          return NextResponse.json(
            { error: 'Processing in progress, please retry' },
            { status: 409 }
          );
        }
      }
      await securityReporter.logSuspiciousActivity({
        type: 'webhook_processing_failed',
        details: {
          eventId: event.id,
          eventType: event.type,
          error: processingResult.result?.error,
          wasAlreadyProcessed: processingResult.wasAlreadyProcessed
        }
      });

      return NextResponse.json(
        {
          error: 'Webhook processing failed',
          eventId: event.id,
          details: processingResult.result?.error
        },
        { status: 500 }
      );
    }

    // 成功レスポンス
    return NextResponse.json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      wasAlreadyProcessed: processingResult.wasAlreadyProcessed
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

    // フォールバックで標準エラー出力
    // eslint-disable-next-line no-console
    console.error('Webhook route error:', error);

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
