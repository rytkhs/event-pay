/**
 * EventPay 構造化ログシステム
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { waitUntil } from "@core/utils/cloudflare-ctx";
import { toErrorLike } from "@core/utils/type-guards";

import type { Database, Json } from "@/types/database";

import { createErrorDedupeHash, releaseErrorDedupeHash, shouldLogError } from "./deduplication";

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
type ConsoleMethod = "debug" | "info" | "warn" | "error";
type JsonObject = { [key: string]: Json | undefined };

function toJsonSafe(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): Json {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
  }

  if (value instanceof Error) {
    return toJsonSafe(
      {
        name: value.name,
        message: value.message,
        stack: value.stack,
      },
      seen
    );
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return toJsonSafe(Object.fromEntries(value), seen);
  }

  if (value instanceof Set) {
    return toJsonSafe(Array.from(value), seen);
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = toJsonSafe(item, seen);
      return normalized ?? null;
    });
  }

  if (typeof value === "object") {
    const normalizedObject: JsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        typeof child === "undefined" ||
        typeof child === "function" ||
        typeof child === "symbol"
      ) {
        continue;
      }
      normalizedObject[key] = toJsonSafe(child, seen);
    }
    return normalizedObject;
  }

  // undefined / function / symbol は JSON 互換値として扱えないため null 化
  return null;
}

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

function createSupabaseClient(envUrl?: string, envKey?: string): SupabaseClient<Database> | null {
  if (!envUrl || !envKey) {
    console.error("Supabase URL or key not found for logging");
    return null;
  }

  // 循環依存回避のため、監査なしの直接クライアントを使用
  return createClient<Database>(envUrl, envKey, {
    auth: { persistSession: false },
  });
}

function serializeLogPayload(payload: unknown): string {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(payload, (_key, value: unknown) => {
      if (typeof value === "bigint") return value.toString();

      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }

      return value;
    });
  } catch (error) {
    return JSON.stringify({
      level: "error",
      msg: "[AppLogger] Failed to serialize log payload",
      timestamp: new Date().toISOString(),
      serialization_error: error instanceof Error ? error.message : String(error),
    });
  }
}

function emitConsoleLog(
  method: ConsoleMethod,
  level: LogLevel,
  msg: string,
  fields: Partial<EventPayLogFields>
): void {
  const payload = {
    level,
    msg,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const serialized = serializeLogPayload(payload);

  switch (method) {
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(serialized);
      return;
    case "info":
      // eslint-disable-next-line no-console
      console.info(serialized);
      return;
    case "warn":
      console.warn(serialized);
      return;
    case "error":
      console.error(serialized);
      return;
    default:
      return;
  }
}

function hasRequiredPersistenceFields(
  fields: Partial<EventPayLogFields>
): fields is Partial<EventPayLogFields> & Pick<EventPayLogFields, "category" | "action"> {
  return (
    typeof fields.category === "string" &&
    typeof fields.action === "string" &&
    fields.action.trim().length > 0
  );
}

/**
 * ログをSupabaseに永続化する
 */
async function persistToSupabase(
  level: LogLevel,
  msg: string,
  envVars: { url?: string; key?: string; redisUrl?: string; redisToken?: string },
  fields: Partial<EventPayLogFields> = {}
): Promise<void> {
  // 本番環境かつ warn 以上のみ DB 保存
  if (
    process.env.NODE_ENV !== "production" ||
    (level !== "warn" && level !== "error" && level !== "critical")
  ) {
    return;
  }

  let dedupeKey: string | undefined;
  let shouldReleaseDedupeKey = false;

  try {
    if (!hasRequiredPersistenceFields(fields)) {
      emitConsoleLog("error", "error", "[AppLogger] Missing required log fields for persistence", {
        category: "system",
        action: "log_persistence_validation",
        target_log_level: level,
        original_message: msg,
        has_category: typeof fields.category === "string",
        has_action: typeof fields.action === "string" && fields.action.trim().length > 0,
      });
      return;
    }

    const errorStack = fields.error_stack || extractErrorStack(fields.error);

    // エラーの重複排除
    if (level === "error" || level === "critical") {
      dedupeKey = await createErrorDedupeHash(msg, errorStack);
      const shouldLog = await shouldLogError(msg, errorStack, {
        redisUrl: envVars.redisUrl,
        redisToken: envVars.redisToken,
        dedupeHash: dedupeKey,
      });
      if (!shouldLog) return;
      shouldReleaseDedupeKey = true;
    }

    const supabase = createSupabaseClient(envVars.url, envVars.key);
    if (!supabase) return;

    const defaultOutcome: LogOutcome =
      level === "error" || level === "critical" ? "failure" : "success";
    const insertPayload: SystemLogInsert = {
      log_level: level,
      log_category: fields.category,
      action: fields.action,
      message: msg,
      outcome: fields.outcome ?? defaultOutcome,
      actor_type: fields.actor_type || "system",
      user_id: fields.user_id,
      resource_type: fields.resource_type,
      resource_id: fields.resource_id,
      error_code: fields.error_code,
      error_message: level === "error" || level === "critical" ? msg : undefined,
      error_stack: errorStack,
      stripe_request_id: fields.stripe_request_id,
      idempotency_key: fields.idempotency_key,
      metadata: toJsonSafe(fields) as SystemLogInsert["metadata"],
      ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    };

    const { error } = await supabase.from("system_logs").insert(insertPayload);
    if (error) {
      if (error.code === "23505" && error.message?.includes("dedupe_key")) {
        shouldReleaseDedupeKey = false;
        return;
      }
      throw new Error(`Failed to insert system log: ${error.message}`);
    }
    shouldReleaseDedupeKey = false;
  } catch (e) {
    if (dedupeKey && shouldReleaseDedupeKey) {
      await releaseErrorDedupeHash(dedupeKey, {
        redisUrl: envVars.redisUrl,
        redisToken: envVars.redisToken,
      });
    }
    console.error("[AppLogger] Failed to persist to Supabase:", e);
  }
}

/**
 * EventPay 専用ロガー
 */
export const logger = {
  debug(msg: string, fields: Partial<EventPayLogFields> = {}) {
    if (process.env.NODE_ENV === "development") {
      emitConsoleLog("debug", "debug", msg, fields);
    }
  },

  info(msg: string, fields: Partial<EventPayLogFields> = {}) {
    emitConsoleLog("info", "info", msg, fields);
  },

  warn(msg: string, fields: Partial<EventPayLogFields> = {}) {
    emitConsoleLog("warn", "warn", msg, fields);
    const envVars = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      redisUrl: process.env.UPSTASH_REDIS_REST_URL,
      redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    if (envVars.url && envVars.key) {
      waitUntil(persistToSupabase("warn", msg, envVars, fields));
    }
  },

  error(msg: string, fields: Partial<EventPayLogFields> = {}) {
    emitConsoleLog("error", "error", msg, fields);
    const envVars = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      redisUrl: process.env.UPSTASH_REDIS_REST_URL,
      redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    if (envVars.url && envVars.key) {
      waitUntil(persistToSupabase("error", msg, envVars, fields));
    }
  },

  critical(msg: string, fields: Partial<EventPayLogFields> = {}) {
    emitConsoleLog("error", "critical", msg, fields);
    const envVars = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      redisUrl: process.env.UPSTASH_REDIS_REST_URL,
      redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    if (envVars.url && envVars.key) {
      waitUntil(persistToSupabase("critical", msg, envVars, fields));
    }
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
