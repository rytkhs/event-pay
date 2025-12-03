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
  /** エラースタック */
  error_stack?: string;
  /** エラーコード */
  error_code?: string;
  /** その他のコンテキスト */
  [key: string]: unknown;
}

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { waitUntil } from "@core/utils/cloudflare-ctx";

import { shouldLogError } from "./deduplication";

/**
 * エラーオブジェクトまたは文字列から安全にスタックトレースを取得
 */
function extractErrorStack(error: unknown): string | undefined {
  if (!error) return undefined;

  // Error オブジェクトの場合
  if (error instanceof Error) {
    return error.stack;
  }

  // stack プロパティを持つオブジェクトの場合
  if (typeof error === "object" && "stack" in error && typeof error.stack === "string") {
    return error.stack;
  }

  // 文字列の場合
  if (typeof error === "string") {
    return error;
  }

  return undefined;
}

function createSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase URL or key not found");
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

/**
 * エラーをSupabaseにも記録する拡張メソッド
 */
async function persistErrorToSupabase(
  level: LogLevel,
  msg: string,
  fields: EventPayLogFields
): Promise<void> {
  // 本番環境かつerrorレベル以上のみDB保存
  if (process.env.NODE_ENV !== "production" || level === "debug" || level === "info") {
    return;
  }

  try {
    // error_stackの安全な取得
    const errorStack = fields.error_stack || extractErrorStack((fields as any).error);

    // 重複チェック
    const shouldLog = await shouldLogError(msg, errorStack);
    if (!shouldLog) {
      return; // 重複エラーはスキップ
    }

    const supabase = createSupabaseClient();
    if (!supabase) {
      return;
    }

    await supabase.from("system_logs").insert({
      log_level: level,
      log_category: fields.tag || "application_error",
      actor_type: "system",
      user_id: fields.user_id,
      action: "error_occurred",
      message: msg,
      outcome: "failure",
      error_code: fields.error_code,
      error_message: msg,
      error_stack: errorStack,
      stripe_request_id: fields.stripe_request_id,
      idempotency_key: fields.idempotency_key,
      metadata: fields as any,
      tags: fields.tag ? [fields.tag] : [],
      dedupe_key: (fields as any).dedupe_key, // 重複排除用
    });
  } catch (e) {
    // DB保存失敗は致命的ではないため、コンソールログのみ
    // eslint-disable-next-line no-console
    console.error("[AppLogger] Failed to persist to Supabase:", e);
  }
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
        ...normalized,
      })
    );
  },

  /**
   * エラーレベルログ
   * Cloudflare WorkersのwaitUntilを使用するため、呼び出し元でのawaitは不要
   */
  error(msg: string, fields?: EventPayLogFields) {
    const normalized = (this as any)._normalize(msg, fields);

    // 1. コンソール出力 (Cloudflare Logs用)
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        timestamp: new Date().toISOString(),
        service: "eventpay",
        env: process.env.NODE_ENV || "development",
        ...normalized,
      })
    );

    // 2. DB保存 (waitUntilでバックグラウンド実行)
    // ここでawaitせず、PromiseをwaitUntilに渡す
    waitUntil(persistErrorToSupabase("error", msg, normalized));
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
