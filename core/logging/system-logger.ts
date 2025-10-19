/**
 * system_logs テーブルへのログ記録ヘルパー
 *
 * 業界標準（ECS、OpenTelemetry、OWASP）に準拠した監査ログを記録します。
 *
 * @module core/logging/system-logger
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";

import { logger } from "./app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

// ============================================================================
// 型定義
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export type LogCategory =
  | "authentication"
  | "authorization"
  | "event_management"
  | "attendance"
  | "payment"
  | "settlement"
  | "stripe_webhook"
  | "stripe_connect"
  | "email"
  | "export"
  | "security"
  | "system";

export type LogOutcome = "success" | "failure" | "unknown";

export type ActorType = "user" | "guest" | "system" | "webhook" | "service_role" | "anonymous";

/**
 * システムログエントリ（必須フィールド）
 */
export interface SystemLogEntry {
  // ログレベルとカテゴリ
  log_level?: LogLevel;
  log_category: LogCategory;

  // 6W1H: Who（誰が）
  actor_type?: ActorType;
  actor_identifier?: string;
  user_id?: string;

  // 6W1H: What（何を）
  action: string;
  resource_type?: string;
  resource_id?: string;

  // 6W1H: Where（どこで）
  ip_address?: string;
  user_agent?: string;

  // 6W1H: Why & How
  message: string;
  outcome?: LogOutcome;

  // トレーサビリティ
  request_id?: string;
  session_id?: string;
  stripe_request_id?: string;
  stripe_event_id?: string;
  idempotency_key?: string;

  // 拡張情報
  metadata?: unknown; // Json 型互換
  tags?: string[];

  // エラー情報（outcome: 'failure' の場合のみ）
  error_code?: string;
  error_message?: string;
  error_stack?: string;

  // 重複防止（Deduplication）
  /**
   * 重複防止キー（冪等性保証用）
   *
   * 指定すると、同一キーのログは1度のみ記録される。
   * Webhook処理やトランザクション処理など、重複実行を防ぎたい場合に使用。
   *
   * **使用例:**
   * ```ts
   * // Webhook処理の重複防止
   * dedupe_key: `webhook:${stripeEventId}`
   *
   * // 決済トランザクションの重複防止
   * dedupe_key: `tx:payment.create:${paymentId}:${Date.now()}`
   *
   * // Idempotency-Keyベース
   * dedupe_key: `idempotent:${idempotencyKey}`
   *
   * // カスタムキー
   * dedupe_key: `${log_category}:${action}:${resource_id}`
   * ```
   *
   * **注意事項:**
   * - NULL値の場合は重複チェックなし（通常の情報ログには不要）
   * - UNIQUE制約違反時はエラーではなく、正常系として扱う
   * - タイムスタンプを含める場合は、ミリ秒単位で一意性を保証
   */
  dedupe_key?: string;
}

/**
 * システムログ記録のオプション
 */
export interface SystemLogOptions {
  /**
   * Pinoにも同時にログ出力するか（デフォルト: true）
   * 重要なイベントは両方に記録することを推奨
   */
  alsoLogToPino?: boolean;

  /**
   * エラー時にスローするか（デフォルト: false）
   * trueの場合、ログ記録失敗時に例外をスローします
   */
  throwOnError?: boolean;
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * system_logs テーブルにログを記録
 *
 * @example
 * ```ts
 * // 認証成功ログ
 * await logToSystemLogs({
 *   log_category: "authentication",
 *   action: "user.login",
 *   message: "User logged in successfully",
 *   actor_type: "user",
 *   user_id: user.id,
 *   ip_address: request.ip,
 *   user_agent: request.headers.get("user-agent"),
 *   outcome: "success"
 * });
 *
 * // 決済エラーログ
 * await logToSystemLogs({
 *   log_level: "error",
 *   log_category: "payment",
 *   action: "payment.create",
 *   message: "Payment creation failed",
 *   actor_type: "user",
 *   user_id: user.id,
 *   resource_type: "payment",
 *   resource_id: paymentId,
 *   outcome: "failure",
 *   error_code: "PAYMENT_FAILED",
 *   error_message: error.message,
 *   stripe_request_id: stripeRequestId,
 *   metadata: {
 *     amount: 5000,
 *     currency: "jpy",
 *     event_id: eventId
 *   }
 * });
 * ```
 */
export async function logToSystemLogs(
  entry: SystemLogEntry,
  options: SystemLogOptions = {}
): Promise<void> {
  const { alsoLogToPino = true, throwOnError = false } = options;

  try {
    // service_role クライアントを作成（RLS回避のため）
    // 循環依存回避のため、監査なしの直接クライアントを使用
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = getEnv().SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // デフォルト値の設定
    const logEntry = {
      log_level: entry.log_level || "info",
      log_category: entry.log_category,
      actor_type: entry.actor_type || "system",
      actor_identifier: entry.actor_identifier,
      user_id: entry.user_id,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      message: entry.message,
      outcome: entry.outcome || "success",
      request_id: entry.request_id,
      session_id: entry.session_id,
      stripe_request_id: entry.stripe_request_id,
      stripe_event_id: entry.stripe_event_id,
      idempotency_key: entry.idempotency_key,
      metadata: entry.metadata,
      tags: entry.tags,
      error_code: entry.error_code,
      error_message: entry.error_message,
      error_stack: entry.error_stack,
      dedupe_key: entry.dedupe_key,
    };

    // system_logs テーブルに挿入
    const { error } = await supabase.from("system_logs").insert(logEntry);

    if (error) {
      // UNIQUE制約違反（dedupe_key重複）は正常系として扱う
      if (error.code === "23505" && error.message?.includes("dedupe_key")) {
        if (alsoLogToPino) {
          logger.debug("Duplicate log entry detected, skipping", {
            tag: "systemLog",
            dedupe_key: entry.dedupe_key,
            action: entry.action,
          });
        }
        return; // 重複ログは無視して正常終了
      }

      throw new Error(`Failed to insert system log: ${error.message}`);
    }

    // Pinoにも出力（開発・デバッグ用）
    if (alsoLogToPino) {
      const pinoLevel = mapLogLevelToPino(entry.log_level || "info");
      logger[pinoLevel](entry.message, {
        tag: "systemLog",
        log_category: entry.log_category,
        action: entry.action,
        outcome: entry.outcome,
        user_id: entry.user_id,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        error_code: entry.error_code,
        metadata: entry.metadata,
      });
    }
  } catch (error) {
    // ログ記録失敗時のフォールバック
    logger.error("Failed to write to system_logs", {
      tag: "systemLogError",
      error: error instanceof Error ? error.message : String(error),
      entry,
    });

    if (throwOnError) {
      throw error;
    }
  }
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * ログレベルをPinoのレベルにマッピング
 */
function mapLogLevelToPino(level: LogLevel): "debug" | "info" | "warn" | "error" {
  switch (level) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    case "error":
    case "critical":
      return "error";
    default:
      return "info";
  }
}

// ============================================================================
// 便利なショートカット関数
// ============================================================================

/**
 * 認証ログを記録
 */
export async function logAuthentication(params: {
  action: string;
  message: string;
  user_id?: string;
  outcome?: LogOutcome;
  ip_address?: string;
  user_agent?: string;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "authentication",
    actor_type: params.user_id ? "user" : "anonymous",
    ...params,
  });
}

/**
 * 認可ログを記録
 */
export async function logAuthorization(params: {
  action: string;
  message: string;
  user_id?: string;
  outcome?: LogOutcome;
  resource_type?: string;
  resource_id?: string;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "authorization",
    actor_type: "user",
    ...params,
  });
}

/**
 * 決済ログを記録
 */
export async function logPayment(params: {
  action: string;
  message: string;
  user_id?: string;
  resource_id?: string;
  outcome?: LogOutcome;
  stripe_request_id?: string;
  idempotency_key?: string;
  metadata?: unknown;
  error_code?: string;
  error_message?: string;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "payment",
    resource_type: "payment",
    actor_type: params.user_id ? "user" : "system",
    log_level: params.outcome === "failure" ? "error" : "info",
    ...params,
  });
}

/**
 * Webhookログを記録
 *
 * @param params.dedupe_key - 重複防止キー（推奨: `webhook:${stripe_event_id}`）
 */
export async function logWebhook(params: {
  action: string;
  message: string;
  stripe_event_id?: string;
  stripe_request_id?: string;
  outcome?: LogOutcome;
  metadata?: unknown;
  error_code?: string;
  error_message?: string;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "stripe_webhook",
    actor_type: "webhook",
    log_level: params.outcome === "failure" ? "error" : "info",
    ...params,
  });
}

/**
 * セキュリティログを記録
 */
export async function logSecurity(params: {
  action: string;
  message: string;
  log_level?: LogLevel;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  outcome?: LogOutcome;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "security",
    log_level: params.log_level || "warn",
    actor_type: params.user_id ? "user" : "anonymous",
    ...params,
  });
}

/**
 * エクスポートログを記録
 */
export async function logExport(params: {
  action: string;
  message: string;
  user_id: string;
  resource_type: string;
  resource_id: string;
  ip_address?: string;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "export",
    actor_type: "user",
    outcome: "success",
    ...params,
  });
}

/**
 * イベント管理ログを記録
 */
export async function logEventManagement(params: {
  action: string;
  message: string;
  user_id: string;
  resource_id: string;
  outcome?: LogOutcome;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "event_management",
    resource_type: "event",
    actor_type: "user",
    ...params,
  });
}

/**
 * 出欠管理ログを記録
 */
export async function logAttendance(params: {
  action: string;
  message: string;
  user_id?: string;
  actor_type?: ActorType;
  resource_id?: string;
  outcome?: LogOutcome;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "attendance",
    resource_type: "attendance",
    actor_type: params.actor_type || (params.user_id ? "user" : "system"),
    ...params,
  });
}

/**
 * Stripe Connect ログを記録
 */
export async function logStripeConnect(params: {
  action: string;
  message: string;
  user_id: string;
  outcome?: LogOutcome;
  stripe_request_id?: string;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "stripe_connect",
    resource_type: "stripe_connect_account",
    actor_type: "user",
    ...params,
  });
}

/**
 * メール送信ログを記録
 */
export async function logEmail(params: {
  action: string;
  message: string;
  actor_type?: ActorType;
  outcome?: LogOutcome;
  metadata?: unknown;
  dedupe_key?: string;
}): Promise<void> {
  await logToSystemLogs({
    log_category: "email",
    actor_type: params.actor_type || "system",
    ...params,
  });
}
