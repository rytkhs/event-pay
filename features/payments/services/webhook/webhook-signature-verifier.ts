import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";

export interface WebhookSignatureVerifier {
  /**
   * Webhook署名を検証する。
   * 注意: 実際の検証に使用するタイムスタンプは Stripe-Signature の t= を必ず使用する。
   */
  verifySignature(params: {
    payload: string;
    signature: string;
  }): Promise<{ isValid: boolean; event?: Stripe.Event; error?: string }>;
}

export class StripeWebhookSignatureVerifier implements WebhookSignatureVerifier {
  private readonly stripe: Stripe;
  private readonly webhookSecrets: string[];
  // 許容秒数は環境変数で調整可能（デフォルト300秒=5分）
  private readonly maxTimestampAge = Number.parseInt(
    process.env.STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE || "300",
    10
  );

  constructor(stripe: Stripe, webhookSecretOrSecrets: string | string[]) {
    this.stripe = stripe;
    this.webhookSecrets = Array.isArray(webhookSecretOrSecrets)
      ? webhookSecretOrSecrets.filter((s) => typeof s === "string" && s.length > 0)
      : [webhookSecretOrSecrets].filter((s) => typeof s === "string" && s.length > 0);
  }

  /**
   * 署名検証を実行する。
   * 注意: 検証に使用するタイムスタンプは Stripe-Signature の t= を必ず使用する。
   */
  async verifySignature(params: {
    payload: string;
    signature: string;
  }): Promise<{ isValid: boolean; event?: Stripe.Event; error?: string }> {
    const { payload, signature } = params;
    let parsedTimestamp: number = Math.floor(Date.now() / 1000);

    try {
      // Stripe署名検証（許容秒数を明示設定）。
      // SDK 内部で timestamp の recency 検証が実施されるため、事前の独自チェックは行わない。
      // ログのために t= を抽出し、検証成功時の監査に含める。
      const tsMatch = signature.match(/t=(\d+)/);
      if (tsMatch) {
        parsedTimestamp = parseInt(tsMatch[1], 10);
      }

      // Stripe 公式 SDK による検証（ローテーション対応：複数シークレットで順次試行）
      let lastError: unknown = undefined;
      for (const secret of this.webhookSecrets) {
        try {
          const event = this.stripe.webhooks.constructEvent(
            payload,
            signature,
            secret,
            this.maxTimestampAge
          );

          // 検証成功をログ
          logger.info("Webhook signature verified", {
            eventType: event.type,
            eventId: event.id,
            timestamp: parsedTimestamp,
          });

          return {
            isValid: true,
            event,
          };
        } catch (err) {
          lastError = err;
          // 次のシークレットで再試行
          continue;
        }
      }

      // すべてのシークレットで検証失敗
      throw lastError ?? new Error("Signature verification failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signature verification failed";

      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        // SDK のエラーメッセージに tolerance 超過が含まれている場合は分類を切り替える
        const isTimestampOutOfRange = /tolerance|timestamp/i.test(message);

        if (isTimestampOutOfRange) {
          const nowSec = Math.floor(Date.now() / 1000);
          const deltaSec = Math.abs(nowSec - parsedTimestamp);
          logger.warn("Webhook timestamp invalid", {
            error: "Timestamp outside tolerance",
            timestamp: parsedTimestamp,
            currentTime: nowSec,
            age: deltaSec,
            maxAge: this.maxTimestampAge,
            signatureProvided: !!signature,
          });
        } else {
          logger.warn("Webhook signature invalid", {
            error: message,
            timestamp: parsedTimestamp,
            signatureProvided: !!signature,
          });
        }
      } else {
        // Stripe SDK 以外の予期しないエラー。分類を変更して冗長ログを防ぐ。
        logger.error("Webhook processing error", {
          error: message,
          timestamp: parsedTimestamp,
          signatureProvided: !!signature,
        });
      }

      return {
        isValid: false,
        error: "invalid_signature",
      };
    }
  }
}
