import pino from "pino";

/**
 * EventPay 構造化ログシステム
 *
 * - 本番環境: JSON 形式で構造化ログ出力
 * - 開発環境: pino-pretty で人間可読な出力
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

/** Pino インスタンスの作成 */
function createPinoLogger() {
  const isDevelopment = process.env.NODE_ENV !== "production";

  const baseConfig = {
    level: isDevelopment ? "debug" : "info",
    base: {
      service: "eventpay",
      env: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "1.0.0",
    },
  };

  if (isDevelopment) {
    // 開発環境: worker を使う transport は使用しない（Next.js dev で thread-stream が落ちるため）
    // 代わりに JSON を stdout に出し、CLI 側で `pino-pretty` にパイプして整形する
    return pino({
      ...baseConfig,
    });
  } else {
    // 本番環境: JSON 出力（Datadog 等への送信用）
    return pino({
      ...baseConfig,
      formatters: {
        // Datadog 互換フォーマット
        level: (label) => ({ level: label }),
        log: (object) => ({
          ...object,
          // Datadog のタグフォーマット
          ddtags: object.tag ? `tag:${object.tag}` : undefined,
        }),
      },
    });
  }
}

const pinoLogger = createPinoLogger();

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
   * デバッグレベルログ（開発環境のみ出力）
   */
  debug(msg: string, fields?: EventPayLogFields) {
    pinoLogger.debug(fields || {}, msg);
  },

  /**
   * 情報レベルログ
   */
  info(msg: string, fields?: EventPayLogFields) {
    pinoLogger.info(fields || {}, msg);
  },

  /**
   * 警告レベルログ
   */
  warn(msg: string, fields?: EventPayLogFields) {
    pinoLogger.warn(fields || {}, msg);
  },

  /**
   * エラーレベルログ
   */
  error(msg: string, fields?: EventPayLogFields) {
    pinoLogger.error(fields || {}, msg);
  },

  /**
   * Stripe リクエストコンテキスト付きの子ロガーを作成
   *
   * @param stripe_request_id Stripe の Request ID
   * @param context 追加のコンテキスト
   */
  withStripeContext(stripe_request_id: string, context?: EventPayLogFields) {
    const child = pinoLogger.child({
      stripe_request_id,
      ...context,
    });

    return {
      debug: (msg: string, fields?: EventPayLogFields) => child.debug(fields || {}, msg),
      info: (msg: string, fields?: EventPayLogFields) => child.info(fields || {}, msg),
      warn: (msg: string, fields?: EventPayLogFields) => child.warn(fields || {}, msg),
      error: (msg: string, fields?: EventPayLogFields) => child.error(fields || {}, msg),
    };
  },

  /**
   * リクエストコンテキスト付きの子ロガーを作成
   *
   * @param context ログコンテキスト
   */
  withContext(context: EventPayLogFields) {
    const child = pinoLogger.child(context);

    return {
      debug: (msg: string, fields?: EventPayLogFields) => child.debug(fields || {}, msg),
      info: (msg: string, fields?: EventPayLogFields) => child.info(fields || {}, msg),
      warn: (msg: string, fields?: EventPayLogFields) => child.warn(fields || {}, msg),
      error: (msg: string, fields?: EventPayLogFields) => child.error(fields || {}, msg),
    };
  },

  /**
   * 生の Pino インスタンスへのアクセス（高度な用途）
   */
  raw: pinoLogger,
} as const;
