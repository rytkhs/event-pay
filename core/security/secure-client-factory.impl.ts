/**
 * EventPay セキュアSupabaseクライアントファクトリー実装
 *
 * 最小権限原則に基づいて設計されたSupabaseクライアントファクトリー
 * 管理者権限の使用を監査し、ゲストトークンによる透過的なアクセス制御を提供
 */

import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { createServerClient, createBrowserClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { COOKIE_CONFIG, AUTH_CONFIG, getCookieConfig } from "@core/security";

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
  private static instance: SecureSupabaseClientFactory;
  private readonly supabaseUrl: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string;
  // Security auditor removed

  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    this.anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!this.supabaseUrl || !this.anonKey || !this.serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    // Security auditor removed
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): SecureSupabaseClientFactory {
    if (!SecureSupabaseClientFactory.instance) {
      SecureSupabaseClientFactory.instance = new SecureSupabaseClientFactory();
    }
    return SecureSupabaseClientFactory.instance;
  }

  /**
   * 新しいインスタンスを作成（テスト用）
   */
  public static create(): SecureSupabaseClientFactory {
    return new SecureSupabaseClientFactory();
  }

  /**
   * 通常の認証済みクライアントを作成
   */
  createAuthenticatedClient(options?: ClientCreationOptions) {
    const cookieStore = cookies();

    return createServerClient(this.supabaseUrl, this.anonKey, {
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
      return createServerClient(this.supabaseUrl, this.anonKey, {
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
            "X-Guest-Token": token, // カスタムヘッダーでトークンを自動設定
            ...options?.headers,
          },
        },
      });
    } else {
      // クライアントサイドでは createClient を使用
      return createClient(this.supabaseUrl, this.anonKey, {
        auth: {
          persistSession: options?.persistSession ?? false, // ゲストセッションは永続化しない
          autoRefreshToken: options?.autoRefreshToken ?? false,
        },
        global: {
          headers: {
            "X-Guest-Token": token, // カスタムヘッダーでトークンを自動設定
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
    } catch (error) {
      throw new AdminAccessError(
        AdminAccessErrorCode.AUDIT_LOG_FAILED,
        `Failed to log admin access: ${error}`,
        auditContext
      );
    }

    // 管理者クライアントを作成
    return createClient(this.supabaseUrl, this.serviceRoleKey, {
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
    return createClient(this.supabaseUrl, this.anonKey, {
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
    // HTTPS接続を動的に検出
    const isHttps =
      request.url.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";

    const cookieConfig = getCookieConfig(isHttps);

    return createServerClient(this.supabaseUrl, this.anonKey, {
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
    return createBrowserClient(this.supabaseUrl, this.anonKey, {
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
 * セキュアクライアントファクトリーのシングルトンインスタンスを取得
 */
export function getSecureClientFactory(): SecureSupabaseClientFactory {
  return SecureSupabaseClientFactory.getInstance();
}
