/**
 * EventPay セキュアSupabaseクライアントファクトリー実装
 *
 * 最小権限原則に基づいて設計されたSupabaseクライアントファクトリー
 * 管理者権限の使用を監査し、ゲストトークンによる透過的なアクセス制御を提供
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";

import { validateGuestTokenFormat } from "./crypto";
import { GuestErrorCode, GuestTokenError } from "./guest-token-errors";
import {
  AdminReason,
  AdminAccessError,
  AdminAccessErrorCode,
  AuditContext,
  ClientCreationOptions,
} from "./secure-client-factory.types";

/**
 * Supabase URLを取得
 */
function getSupabaseUrl(): string {
  const env = getEnv();
  const value = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    const key = "NEXT_PUBLIC_SUPABASE_URL";
    const message = `Missing required environment variable: ${key}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action: "client_creation",
      actorType: "system",
      additionalData: {
        variable_name: key,
      },
    });
    throw new Error(message);
  }
  return value;
}

/**
 * Supabase Anon Keyを取得
 */
function getAnonKey(): string {
  const env = getEnv();
  const value = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    const key = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
    const message = `Missing required environment variable: ${key}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action: "client_creation",
      actorType: "system",
      additionalData: {
        variable_name: key,
      },
    });
    throw new Error(message);
  }
  return value;
}

/**
 * Supabase Service Role Keyを取得
 */
function getServiceRoleKey(): string {
  const env = getEnv();
  const value = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    const key = "SUPABASE_SERVICE_ROLE_KEY";
    const message = `Missing required environment variable: ${key}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action: "client_creation",
      actorType: "system",
      additionalData: {
        variable_name: key,
      },
    });
    throw new Error(message);
  }
  return value;
}

/**
 * ゲストトークン認証クライアントを作成
 * X-Guest-Tokenヘッダーを自動設定し、RLSポリシーベースのアクセス制御を実現
 *
 * ゲスト用途は Cookie ベースの Supabase Auth セッションを利用しないため、
 * server/client を問わず createClient を使い、非永続セッションを固定する。
 */
export function createGuestClient(token: string, options?: ClientCreationOptions) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey();

  // トークンの基本フォーマット検証
  if (!validateGuestTokenFormat(token)) {
    throw new GuestTokenError(
      GuestErrorCode.INVALID_FORMAT,
      "Invalid guest token format. Token must be 36 characters long with gst_ prefix.",
      { tokenLength: token.length }
    );
  }

  return createClient(supabaseUrl, anonKey, {
    // ゲストアクセスは常に非永続セッション運用
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-guest-token": token, // カスタムヘッダーでトークンを自動設定
        ...options?.headers,
      },
    },
  });
}

/**
 * 監査付き管理者クライアントを作成
 * 管理者権限の使用を記録し、適切な理由と共に監査ログに記録
 */
export async function createAuditedAdminClient(
  reason: AdminReason,
  context: string,
  auditContext?: AuditContext,
  options?: ClientCreationOptions
) {
  // 理由の妥当性をチェック
  if (!Object.values(AdminReason).includes(reason)) {
    throw new AdminAccessError(
      AdminAccessErrorCode.UNAUTHORIZED_REASON,
      `Invalid admin reason: ${reason}`,
      auditContext
    );
  }

  // コンテキストが提供されているかチェック
  if (!context || context.trim().length === 0) {
    throw new AdminAccessError(
      AdminAccessErrorCode.MISSING_CONTEXT,
      "Admin access context is required",
      auditContext
    );
  }

  // 監査ログを記録
  try {
    logger.info("Admin access logged", {
      category: "security",
      action: "admin_access",
      actor_type: "service_role",
      reason,
      context,
      user_id: auditContext?.userId,
      outcome: "success",
    });

    // DB監査ログへの記録
    // 注意: ここではまだクライアントを作成していないため、動的インポートで logToSystemLogs を使用
    const { logToSystemLogs } = await import("@core/logging/system-logger");
    await logToSystemLogs(
      {
        log_category: "security",
        action: "admin.access",
        message: `Admin access: ${reason}`,
        actor_type: "service_role",
        actor_identifier: reason,
        user_id: auditContext?.userId,
        ip_address: auditContext?.ipAddress,
        user_agent: auditContext?.userAgent,
        outcome: "success",
        metadata: {
          reason,
          context,
          operation_type: auditContext?.operationType,
          accessed_tables: auditContext?.accessedTables,
          additional_info: auditContext?.additionalInfo,
        },
      },
      { alsoLogToPino: false } // pinoへの重複記録を避ける
    );
  } catch (error) {
    throw new AdminAccessError(
      AdminAccessErrorCode.AUDIT_LOG_FAILED,
      `Failed to log admin access: ${error}`,
      auditContext
    );
  }

  // 管理者クライアントを作成
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: options?.autoRefreshToken ?? false,
      persistSession: options?.persistSession ?? false,
    },
    global: {
      headers: {
        "X-Admin-Reason": reason,
        "X-Admin-Context": context,
        "X-Admin-User-Id": auditContext?.userId || "system",
        ...options?.headers,
      },
    },
  });
}
