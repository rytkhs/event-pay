/**
 * EventPay 構造化ログシステム
 *
 * - 本番環境: JSON 形式で構造化ログ出力
 * - 開発環境: JSON 形式で構造化ログ出力
 * - Stripe request-id、Idempotency-Key、タグ機能対応
 * - Datadog 等 APM への送信準備
 */

/** ログレベル定義 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** EventPay 専用フィールド */
export interface EventPayLogFields {
  /** Stripe Request ID (障害調査用) */
  stripe_request_id?: string;
  /** 冪等性キー */
  idempotency_key?: string;
  /** イベント ID */
  event_id?: string;
  /** ユーザー ID */
  user_id?: string;
  /** 機能タグ (cacheHit, cacheMiss, fetchFailed, retryAttempt 等) */
  tag?: string;
  /** リトライ回数 */
  retry?: number;
  /** その他のコンテキスト */
  [key: string]: unknown;
}

/**
 * EventPay 専用ロガー
 *
 * 使用例:
 * ```ts
 * logger.info('Fee config fetched from cache', { tag: 'cacheHit', event_id: 'evt_123' });
 * logger.warn('Stripe API failed', {
 *   tag: 'fetchFailed',
 *   stripe_request_id: 'req_abc123',
 *   retry: 2
 * });
 * ```
 */
export const logger = {
  /**
   * ログフィールドを正規化（セキュリティ系の既存ばらつきを吸収）
   */
  _normalize(msg: string, fields?: EventPayLogFields): EventPayLogFields {
    const merged: EventPayLogFields = { ...(fields || {}) };

    // 旧来のセキュリティ系タグを securityEvent に収束
    if (
      merged.tag === "security-rejected" ||
      merged.tag === "qstash-security" ||
      merged.tag === "event-cancel-security"
    ) {
      merged.tag = "securityEvent";
      if (!(merged as any).security_type && typeof (merged as any).type === "string") {
        (merged as any).security_type = (merged as any).type;
      }
      if (!(merged as any).security_severity) {
        (merged as any).security_severity = "MEDIUM";
      }
    }

    // Webhook系の散在ログ: メッセージや type から securityEvent に寄せる
    if (merged.tag == null) {
      const typeVal = (merged as any)?.type;
      if (typeof typeVal === "string") {
        if (
          typeVal.startsWith("webhook_") ||
          typeVal.startsWith("qstash_") ||
          typeVal.startsWith("refund_") ||
          typeVal.startsWith("settlement_") ||
          typeVal.startsWith("dispute_")
        ) {
          merged.tag = "securityEvent";
          if (!(merged as any).security_type) (merged as any).security_type = typeVal;
          if (!(merged as any).security_severity) (merged as any).security_severity = "MEDIUM";
        }
      }

      // メッセージが固定のセキュリティイベント
      if (merged.tag == null && msg === "Webhook security event") {
        merged.tag = "securityEvent";
        if (typeof (merged as any)?.type === "string" && !(merged as any).security_type) {
          (merged as any).security_type = (merged as any).type;
        }
        if (!(merged as any).security_severity) (merged as any).security_severity = "MEDIUM";
      }
    }

    return merged;
  },
  /**
   * デバッグレベルログ（開発環境のみ出力）
   */
  debug(msg: string, fields?: EventPayLogFields) {
    const normalized = (this as any)._normalize(msg, fields);
    // eslint-disable-next-line no-console
    console.debug(
      JSON.stringify({
        level: "debug",
        msg,
        timestamp: new Date().toISOString(),
        service: "eventpay",
        env: process.env.NODE_ENV || "development",
        version: process.env.npm_package_version || "1.0.0",
        ...normalized,
      })
    );
  },

  /**
   * 情報レベルログ
   */
  info(msg: string, fields?: EventPayLogFields) {
    const normalized = (this as any)._normalize(msg, fields);
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        level: "info",
        msg,
        timestamp: new Date().toISOString(),
        service: "eventpay",
        env: process.env.NODE_ENV || "development",
        version: process.env.npm_package_version || "1.0.0",
        ...normalized,
      })
    );
  },

  /**
   * 警告レベルログ
   */
  warn(msg: string, fields?: EventPayLogFields) {
    const normalized = (this as any)._normalize(msg, fields);
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: "warn",
        msg,
        timestamp: new Date().toISOString(),
        service: "eventpay",
        env: process.env.NODE_ENV || "development",
        version: process.env.npm_package_version || "1.0.0",
        ...normalized,
      })
    );
  },

  /**
   * エラーレベルログ
   */
  error(msg: string, fields?: EventPayLogFields) {
    const normalized = (this as any)._normalize(msg, fields);
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        timestamp: new Date().toISOString(),
        service: "eventpay",
        env: process.env.NODE_ENV || "development",
        version: process.env.npm_package_version || "1.0.0",
        ...normalized,
      })
    );
  },

  /**
   * Stripe リクエストコンテキスト付きの子ロガーを作成
   *
   * @param stripe_request_id Stripe の Request ID
   * @param context 追加のコンテキスト
   */
  withStripeContext(stripe_request_id: string, context?: EventPayLogFields) {
    const mergedContext = { stripe_request_id, ...context };

    return {
      debug: (msg: string, fields?: EventPayLogFields) =>
        logger.debug(msg, { ...mergedContext, ...fields }),
      info: (msg: string, fields?: EventPayLogFields) =>
        logger.info(msg, { ...mergedContext, ...fields }),
      warn: (msg: string, fields?: EventPayLogFields) =>
        logger.warn(msg, { ...mergedContext, ...fields }),
      error: (msg: string, fields?: EventPayLogFields) =>
        logger.error(msg, { ...mergedContext, ...fields }),
    };
  },

  /**
   * リクエストコンテキスト付きの子ロガーを作成
   *
   * @param context ログコンテキスト
   */
  withContext(context: EventPayLogFields) {
    return {
      debug: (msg: string, fields?: EventPayLogFields) =>
        logger.debug(msg, { ...context, ...fields }),
      info: (msg: string, fields?: EventPayLogFields) =>
        logger.info(msg, { ...context, ...fields }),
      warn: (msg: string, fields?: EventPayLogFields) =>
        logger.warn(msg, { ...context, ...fields }),
      error: (msg: string, fields?: EventPayLogFields) =>
        logger.error(msg, { ...context, ...fields }),
    };
  },

  /**
   * 生のロガーインスタンスへのアクセス（互換性のため空オブジェクト）
   */
  raw: {},
} as const;
