/**
 * EventPay 構造化ログシステム
 *
 * - 本番環境: JSON 形式で構造化ログ出力
 * - 開発環境: JSON 形式で構造化ログ出力
 * - Stripe request-id、Idempotency-Key、タグ機能対応
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { waitUntil } from "@core/utils/cloudflare-ctx";
import { toErrorLike } from "@core/utils/type-guards";

import type { Database } from "@/types/database";

import { shouldLogError } from "./deduplication";

/** ログレベル定義 */
export type LogLevel = Database["public"]["Enums"]["log_level_enum"];

/** ログカテゴリ定義 */
export type LogCategory = Database["public"]["Enums"]["log_category_enum"];

/** 処理結果定義 */
export type LogOutcome = Database["public"]["Enums"]["log_outcome_enum"];

/** アクター種別定義 */
export type ActorType = Database["public"]["Enums"]["actor_type_enum"];

/** EventPay 専用フィールド */
export interface EventPayLogFields {
  /** ログカテゴリ */
  category: LogCategory;
  /** アクション名 (What) */
  action: string;
  /** 処理結果 (Outcome) */
  outcome?: LogOutcome;
  /** アクター種別 (Who) */
  actor_type?: ActorType;
  /** リソース種別 */
  resource_type?: string;
  /** リソース ID */
  resource_id?: string;
  /** ユーザー ID */
  user_id?: string;
  /** Stripe Request ID */
  stripe_request_id?: string;
  /** 冪等性キー */
  idempotency_key?: string;
  /** エラースタック */
  error_stack?: string;
  /** エラーコード */
  error_code?: string;
  /** その他メタデータ */
  [key: string]: unknown;
}

type SystemLogInsert = Database["public"]["Tables"]["system_logs"]["Insert"];

/**
 * エラーオブジェクトまたは文字列から安全にスタックトレースを取得
 */
function extractErrorStack(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.stack;
  const stack = toErrorLike(error).stack;
  if (typeof stack === "string") return stack;
  if (typeof error === "string") return error;
  return undefined;
}

function createSupabaseClient(): SupabaseClient<Database> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("Supabase URL or key not found for logging");
    }
    return null;
  }

  // 循環依存回避のため、監査なしの直接クライアントを使用
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

/**
 * ログをSupabaseに永続化する
 */
async function persistToSupabase(
  level: LogLevel,
  msg: string,
  fields: Partial<EventPayLogFields> = {}
): Promise<void> {
  // 本番環境かつ warn 以上のみ DB 保存 (不要なトラフィック抑制)
  if (process.env.NODE_ENV !== "production" || (level !== "error" && level !== "warn")) {
    return;
  }

  try {
    const errorStack = fields.error_stack || extractErrorStack(fields.error);

    // エラーの重複排除
    if (level === "error") {
      const shouldLog = await shouldLogError(msg, errorStack);
      if (!shouldLog) return;
    }

    const supabase = createSupabaseClient();
    if (!supabase) return;

    // フォールバックなしで直接使用
    await supabase.from("system_logs").insert({
      log_level: level,
      log_category: fields.category || "system",
      action: fields.action || "log",
      message: msg,
      outcome: fields.outcome || "success",
      actor_type: fields.actor_type || "system",
      user_id: fields.user_id,
      resource_type: fields.resource_type,
      resource_id: fields.resource_id,
      error_code: fields.error_code,
      error_message: level === "error" ? msg : undefined,
      error_stack: errorStack,
      stripe_request_id: fields.stripe_request_id,
      idempotency_key: fields.idempotency_key,
      metadata: fields as SystemLogInsert["metadata"],
    });
  } catch (e) {
    console.error("[AppLogger] Failed to persist to Supabase:", e);
  }
}

/**
 * EventPay 専用ロガー
 */
export const logger = {
  debug(msg: string, fields: Partial<EventPayLogFields> = {}) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug(
        JSON.stringify({
          level: "debug",
          msg,
          env: process.env.NODE_ENV,
          timestamp: new Date().toISOString(),
          ...fields,
        })
      );
    }
  },

  info(msg: string, fields: Partial<EventPayLogFields> = {}) {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        level: "info",
        msg,
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        ...fields,
      })
    );
  },

  warn(msg: string, fields: Partial<EventPayLogFields> = {}) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: "warn",
        msg,
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        ...fields,
      })
    );
    waitUntil(persistToSupabase("warn", msg, fields));
  },

  error(msg: string, fields: Partial<EventPayLogFields> = {}) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        ...fields,
      })
    );
    waitUntil(persistToSupabase("error", msg, fields));
  },

  critical(msg: string, fields: Partial<EventPayLogFields> = {}) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "critical",
        msg,
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        ...fields,
      })
    );
    waitUntil(persistToSupabase("critical", msg, fields));
  },

  withContext(context: Partial<EventPayLogFields>) {
    return {
      debug: (msg: string, fields: Partial<EventPayLogFields> = {}) =>
        logger.debug(msg, { ...context, ...fields }),
      info: (msg: string, fields: Partial<EventPayLogFields> = {}) =>
        logger.info(msg, { ...context, ...fields }),
      warn: (msg: string, fields: Partial<EventPayLogFields> = {}) =>
        logger.warn(msg, { ...context, ...fields }),
      error: (msg: string, fields: Partial<EventPayLogFields> = {}) =>
        logger.error(msg, { ...context, ...fields }),
      critical: (msg: string, fields: Partial<EventPayLogFields> = {}) =>
        logger.critical(msg, { ...context, ...fields }),
    };
  },
} as const;
