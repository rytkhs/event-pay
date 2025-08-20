import { logger } from "@/lib/logging/app-logger";

/**
 * Execute a Stripe request with automatic handling of `idempotency_key_in_use` (HTTP 409).
 *
 * Stripe SDK は 429/5xx などは自動リトライしますが、409 は対象外。
 * 本ヘルパーは同一 Idempotency-Key で指数バックオフを行い、
 * 指定回数以内に成功レスポンスが返るまで再試行します。
 *
 * ▪ maxRetries   –  最大リトライ回数 (デフォルト 5)
 * ▪ initialDelay –  初回バックオフ待機時間 ms (デフォルト 500)
 */
export async function retryWithIdempotency<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; initialDelayMs?: number } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  let delay = opts.initialDelayMs ?? 500;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as { code?: string; statusCode?: number; message?: string };
      const isIdempo409 =
        err.code === "idempotency_key_in_use" || err.statusCode === 409;

      // ネットワーク切断・TLS reset など Stripe SDK が返す ConnectionError 系
      // 例) StripeConnectionError, StripeConnectionTimeoutError, StripeAPIConnectionError
      const isConnectionErr =
        typeof err.type === "string" && err.type.endsWith("ConnectionError");

      const shouldRetry = isIdempo409 || isConnectionErr;

      if (!shouldRetry || attempt === maxRetries) {
        throw error; // 他エラー、またはリトライ上限超過
      }

      logger.warn("stripe_idempotency_retry", {
        attempt: attempt + 1,
        delay_ms: delay,
        message: err.message,
        error_type: err.type,
      });

      await new Promise((res) => setTimeout(res, delay + Math.random() * 100));
      delay *= 2; // 指数バックオフ
    }
  }
  // ここには来ないはず
  throw new Error("Exceeded retryWithIdempotency attempts");
}
