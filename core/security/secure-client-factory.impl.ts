/**
 * EventPay セキュアSupabaseクライアントファクトリー実装
 *
 * 最小権限原則に基づいて設計されたSupabaseクライアントファクトリー
 * 管理者権限の使用を監査し、ゲストトークンによる透過的なアクセス制御を提供
 */

import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { SupabaseClientFactory } from "@core/supabase/factory";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";

import { validateGuestTokenFormat } from "./crypto";
import { GuestErrorCode, GuestTokenError } from "./guest-token-errors";
import { ISecureSupabaseClientFactory } from "./secure-client-factory.interface";
import {
  AdminReason,
  AdminAccessError,
  AdminAccessErrorCode,
  AuditContext,
  ClientCreationOptions,
} from "./secure-client-factory.types";

/**
 * セキュアSupabaseクライアントファクトリーの実装
 */
export class SecureSupabaseClientFactory implements ISecureSupabaseClientFactory {
  constructor() {
    // 環境変数はメソッド内で動的に取得するため、コンストラクタでは初期化しない
  }

  /**
   * Supabase URLを取得
   */
  private getSupabaseUrl(): string {
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
  private getAnonKey(): string {
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
  private getServiceRoleKey(): string {
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
   * 通常の認証済みクライアントを作成
   */
  async createAuthenticatedClient(_options?: ClientCreationOptions) {
    if (typeof window !== "undefined" || typeof document !== "undefined") {
      const message = "createAuthenticatedClient is server-only.";
      handleServerError("INTERNAL_ERROR", {
        category: "authentication",
        action: "client_creation",
        actorType: "system",
        additionalData: {
          reason: "BROWSER_CONTEXT_NOT_SUPPORTED",
        },
      });
      throw new Error(message);
    }

    return await SupabaseClientFactory.createServerClient("api");
  }

  /**
   * ゲストトークン認証クライアントを作成
   * X-Guest-Tokenヘッダーを自動設定し、RLSポリシーベースのアクセス制御を実現
   *
   * NOTE:
   * ゲスト用途は Cookie ベースの Supabase Auth セッションを利用しないため、
   * server/client を問わず createClient を使い、非永続セッションを固定する。
   */
  createGuestClient(token: string, options?: ClientCreationOptions) {
    const supabaseUrl = this.getSupabaseUrl();
    const anonKey = this.getAnonKey();

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
  async createAuditedAdminClient(
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
    const supabaseUrl = this.getSupabaseUrl();
    const serviceRoleKey = this.getServiceRoleKey();

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

  /**
   * 公開RPC向けの匿名クライアントを作成
   */
  createPublicClient(options?: ClientCreationOptions) {
    const supabaseUrl = this.getSupabaseUrl();
    const anonKey = this.getAnonKey();

    return createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: options?.persistSession ?? false,
        autoRefreshToken: options?.autoRefreshToken ?? false,
      },
      global: {
        headers: {
          ...options?.headers,
        },
      },
    });
  }

  /**
   * ミドルウェア用クライアントを作成
   */
  async createMiddlewareClient(
    request: NextRequest,
    response: NextResponse,
    _options?: ClientCreationOptions
  ) {
    return await SupabaseClientFactory.createServerClient("middleware", { request, response });
  }
}

/**
 * セキュアクライアントファクトリーのインスタンスを取得
 */
export function getSecureClientFactory(): SecureSupabaseClientFactory {
  return new SecureSupabaseClientFactory();
}
