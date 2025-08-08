import Stripe from "stripe";
import type { SecurityReporter } from "@/lib/security/security-reporter.types";

export interface WebhookSignatureVerifier {
  /**
   * Webhook署名を検証する。
   * 注意: 実際の検証に使用するタイムスタンプは Stripe-Signature の t= を必ず使用する。
   * fallbackTimestamp はログ用途のみで、検証には使用されない。
   */
  verifySignature(params: {
    payload: string;
    signature: string;
    fallbackTimestamp?: number;
  }): Promise<{ isValid: boolean; event?: Stripe.Event; error?: string }>;
}

export class StripeWebhookSignatureVerifier implements WebhookSignatureVerifier {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly securityReporter: SecurityReporter;
  // 許容秒数は環境変数で調整可能（デフォルト300秒=5分）
  private readonly maxTimestampAge = Number.parseInt(process.env.STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE || "300", 10);

  constructor(stripe: Stripe, webhookSecret: string, securityReporter: SecurityReporter) {
    this.stripe = stripe;
    this.webhookSecret = webhookSecret;
    this.securityReporter = securityReporter;
  }

  /**
   * 署名検証を実行する。
   * 注意: 検証に使用するタイムスタンプは Stripe-Signature の t= を必ず使用する。
   * fallbackTimestamp はログ用途のみで、検証には使用されない。
   */
  async verifySignature(params: {
    payload: string;
    signature: string;
    fallbackTimestamp?: number;
  }): Promise<{ isValid: boolean; event?: Stripe.Event; error?: string }> {
    const { payload, signature, fallbackTimestamp } = params;
    let parsedTimestamp: number = Math.floor(Date.now() / 1000);

    try {
      // セキュリティ上の理由により、検証に用いるタイムスタンプは必ず Stripe-Signature の t= を使用
      const tsMatch = signature.match(/t=(\d+)/);
      if (!tsMatch) {
        await this.securityReporter.logSuspiciousActivity({
          type: "webhook_signature_invalid",
          details: {
            error: "Missing timestamp in Stripe-Signature",
            signatureProvided: !!signature,
            providedTimestamp: fallbackTimestamp,
          },
        });

        return {
          isValid: false,
          error: "Missing timestamp in Stripe-Signature",
        };
      }
      const timestamp = parseInt(tsMatch[1], 10);
      parsedTimestamp = timestamp;

      // 事前にタイムスタンプの乖離を判定（決定論的に分類）
      const nowSec = Math.floor(Date.now() / 1000);
      const deltaSec = Math.abs(nowSec - parsedTimestamp);
      if (deltaSec > this.maxTimestampAge) {
        await this.securityReporter.logSuspiciousActivity({
          type: "webhook_timestamp_invalid",
          details: {
            timestamp: parsedTimestamp,
            currentTime: nowSec,
            age: deltaSec,
            maxAge: this.maxTimestampAge,
          },
        });

        return {
          isValid: false,
          error: "Webhook timestamp is too old",
        };
      }

      // Stripe署名検証（許容秒数を明示設定）
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
        this.maxTimestampAge
      );

      // 検証成功をログ
      await this.securityReporter.logSecurityEvent({
        type: "webhook_signature_verified",
        details: {
          eventType: event.type,
          eventId: event.id,
          timestamp: parsedTimestamp,
        },
      });

      return {
        isValid: true,
        event,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signature verification failed";
      // 決定論的にタイムスタンプ乖離を再チェック
      const nowSec = Math.floor(Date.now() / 1000);
      const deltaSec = Math.abs(nowSec - parsedTimestamp);
      const isTimestampOutOfRange = Number.isFinite(deltaSec) && deltaSec > this.maxTimestampAge;

      await this.securityReporter.logSuspiciousActivity({
        type: isTimestampOutOfRange ? "webhook_timestamp_invalid" : "webhook_signature_invalid",
        details: isTimestampOutOfRange
          ? {
            error: "Timestamp outside tolerance",
            timestamp: parsedTimestamp,
            currentTime: nowSec,
            age: deltaSec,
            maxAge: this.maxTimestampAge,
            signatureProvided: !!signature,
          }
          : {
            error: message,
            timestamp: parsedTimestamp,
            signatureProvided: !!signature,
          },
      });

      return {
        isValid: false,
        error: isTimestampOutOfRange ? "Webhook timestamp is too old" : message,
      };
    }
  }
}
