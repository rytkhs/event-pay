/**
 * EventPay セキュアSupabaseクライアントファクトリー実装
 *
 * 最小権限原則に基づいて設計されたSupabaseクライアントファクトリー
 * 管理者権限の使用を監査し、ゲストトークンによる透過的なアクセス制御を提供
 */

import "server-only";

// next/headers は テスト環境では利用できないため動的インポート
import type { NextRequest, NextResponse } from "next/server";

import { createServerClient, createBrowserClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

import { COOKIE_CONFIG, AUTH_CONFIG, getCookieConfig } from "./config";
import { validateGuestTokenFormat } from "./crypto";
import { ISecureSupabaseClientFactory } from "./secure-client-factory.interface";
import {
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
  AdminAccessError,
  AdminAccessErrorCode,
  AuditContext,
  ClientCreationOptions,
} from "./secure-client-factory.types";

/**
 * セキュアSupabaseクライアントファクトリーの実装
 */
export class SecureSupabaseClientFactory implements ISecureSupabaseClientFactory {
  // Security auditor removed

  constructor() {
    // 環境変数はメソッド内で動的に取得するため、コンストラクタでは初期化しない
    // Security auditor removed
  }

  /**
   * 新しいインスタンスを作成
   */
  public static create(): SecureSupabaseClientFactory {
    return new SecureSupabaseClientFactory();
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
      logger.error(message, { tag: "envVarMissing", variable_name: key });
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
      logger.error(message, { tag: "envVarMissing", variable_name: key });
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
      logger.error(message, { tag: "envVarMissing", variable_name: key });
      throw new Error(message);
    }
    return value;
  }

  /**
   * 通常の認証済みクライアントを作成
   */
  createAuthenticatedClient(options?: ClientCreationOptions) {
    const env = getEnv();
    const supabaseUrl = this.getSupabaseUrl();
    const anonKey = this.getAnonKey();

    // テスト環境またはヘッダーが利用できない場合はブラウザクライアントを作成
    if (env.NODE_ENV === "test" || typeof document !== "undefined") {
      return createBrowserClient(supabaseUrl, anonKey, {
        auth: {
          persistSession: options?.persistSession ?? true,
          autoRefreshToken: options?.autoRefreshToken ?? true,
        },
        global: {
          headers: options?.headers || {},
        },
      });
    }

    // 動的にnext/headersをインポート
    let cookieStore;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { cookies } = require("next/headers");
      cookieStore = cookies();
    } catch (error) {
      // next/headersが利用できない場合はブラウザクライアントを作成
      return createBrowserClient(supabaseUrl, anonKey, {
        auth: {
          persistSession: options?.persistSession ?? true,
          autoRefreshToken: options?.autoRefreshToken ?? true,
        },
        global: {
          headers: options?.headers || {},
        },
      });
    }

    return createServerClient(supabaseUrl, anonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, cookieOptions: CookieOptions) {
          cookieStore.set(name, value, {
            ...cookieOptions,
            ...COOKIE_CONFIG,
            maxAge:
              name === AUTH_CONFIG.cookieNames.session
                ? AUTH_CONFIG.session.maxAge
                : cookieOptions.maxAge != null
                  ? cookieOptions.maxAge
                  : undefined,
          });
        },
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
      auth: {
        persistSession: options?.persistSession ?? true,
        autoRefreshToken: options?.autoRefreshToken ?? true,
      },
      global: {
        headers: options?.headers || {},
      },
    });
  }

  /**
   * ゲストトークン認証クライアントを作成
   * X-Guest-Tokenヘッダーを自動設定し、RLSポリシーベースのアクセス制御を実現
   * SSR環境でも安全に動作するよう環境を考慮
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

    // SSR環境（サーバーサイド）かどうかを判定
    const isServerSide = typeof window === "undefined";

    if (isServerSide) {
      // サーバーサイドでは createServerClient を使用（ただしcookiesは不要）
      return createServerClient(supabaseUrl, anonKey, {
        cookies: {
          get: () => undefined,
          set: () => {},
          remove: () => {},
        },
        auth: {
          persistSession: false, // ゲストセッションは永続化しない
          autoRefreshToken: false,
        },
        global: {
          headers: {
            "x-guest-token": token, // カスタムヘッダーでトークンを自動設定
            ...options?.headers,
          },
        },
      });
    } else {
      // クライアントサイドでは createClient を使用
      return createClient(supabaseUrl, anonKey, {
        auth: {
          persistSession: options?.persistSession ?? false, // ゲストセッションは永続化しない
          autoRefreshToken: options?.autoRefreshToken ?? false,
        },
        global: {
          headers: {
            "x-guest-token": token, // カスタムヘッダーでトークンを自動設定
            ...options?.headers,
          },
        },
      });
    }
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
      const _fullAuditContext: AuditContext = {
        userId: auditContext?.userId,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        accessedTables: auditContext?.accessedTables,
        operationType: auditContext?.operationType,
        additionalInfo: {
          reason,
          context,
          timestamp: new Date().toISOString(),
          ...auditContext?.additionalInfo,
        },
      };

      logger.info("Admin access logged", { reason, context });

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
   * 読み取り専用クライアントを作成
   */
  createReadOnlyClient(options?: ClientCreationOptions) {
    const supabaseUrl = this.getSupabaseUrl();
    const anonKey = this.getAnonKey();

    return createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: options?.persistSession ?? false,
        autoRefreshToken: options?.autoRefreshToken ?? false,
      },
      global: {
        headers: {
          "X-Read-Only": "true",
          ...options?.headers,
        },
      },
    });
  }

  /**
   * ミドルウェア用クライアントを作成
   */
  createMiddlewareClient(
    request: NextRequest,
    response: NextResponse,
    options?: ClientCreationOptions
  ) {
    const supabaseUrl = this.getSupabaseUrl();
    const anonKey = this.getAnonKey();

    // HTTPS接続を動的に検出
    const isHttps =
      request.url.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";

    const cookieConfig = getCookieConfig(isHttps);

    return createServerClient(supabaseUrl, anonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, cookieOptions: CookieOptions) {
          response.cookies.set(name, value, {
            ...cookieOptions,
            ...cookieConfig,
          });
        },
        remove(name: string, cookieOptions: CookieOptions) {
          response.cookies.delete({ name, ...cookieOptions });
        },
      },
      auth: {
        persistSession: options?.persistSession ?? true,
        autoRefreshToken: options?.autoRefreshToken ?? true,
      },
      global: {
        headers: {
          "X-Middleware-Client": "true",
          ...options?.headers,
        },
      },
    });
  }

  /**
   * ブラウザ用クライアントを作成
   */
  createBrowserClient(options?: ClientCreationOptions) {
    const supabaseUrl = this.getSupabaseUrl();
    const anonKey = this.getAnonKey();

    return createBrowserClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: options?.persistSession ?? true,
        autoRefreshToken: options?.autoRefreshToken ?? true,
      },
      global: {
        headers: {
          "X-Browser-Client": "true",
          ...options?.headers,
        },
      },
    });
  }
}

/**
 * セキュアクライアントファクトリーのインスタンスを取得
 */
export function getSecureClientFactory(): SecureSupabaseClientFactory {
  return SecureSupabaseClientFactory.create();
}
