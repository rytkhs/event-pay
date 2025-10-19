import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { COOKIE_CONFIG, AUTH_CONFIG, getCookieConfig } from "@core/security";
import { getSessionManager } from "@core/session/manager";
import { getEnv } from "@core/utils/cloudflare-env";

import type { Database } from "@/types/database";

type SupabaseContext = "middleware" | "api" | "server";

interface MiddlewareSupabaseConfig {
  request: NextRequest;
  response: NextResponse;
}

export class SupabaseClientFactory {
  private static sessionManager = getSessionManager();
  private static cachedUrl: string;
  private static cachedAnonKey: string;

  private static getURL(): string {
    if (!this.cachedUrl) {
      const env = getEnv();
      const value = env.NEXT_PUBLIC_SUPABASE_URL;
      if (!value) {
        const key = "NEXT_PUBLIC_SUPABASE_URL";
        const message = `Missing required environment variable: ${key}`;
        logger.error(message, { tag: "envVarMissing", variable_name: key });
        throw new Error(message);
      }
      this.cachedUrl = value;
    }
    return this.cachedUrl;
  }

  private static getAnonKey(): string {
    if (!this.cachedAnonKey) {
      const env = getEnv();
      const value = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!value) {
        const key = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
        const message = `Missing required environment variable: ${key}`;
        logger.error(message, { tag: "envVarMissing", variable_name: key });
        throw new Error(message);
      }
      this.cachedAnonKey = value;
    }
    return this.cachedAnonKey;
  }

  static createServerClient(context: "server"): SupabaseClient<Database>;
  static createServerClient(context: "api"): SupabaseClient<Database>;
  static createServerClient(
    context: "middleware",
    config: MiddlewareSupabaseConfig
  ): SupabaseClient<Database>;
  static createServerClient(
    context: SupabaseContext,
    config?: MiddlewareSupabaseConfig
  ): SupabaseClient<Database> {
    switch (context) {
      case "middleware":
        if (!config) {
          throw new Error("Middleware context requires request and response objects");
        }
        return this.createMiddlewareClient(config);

      case "api":
      case "server":
        return this.createApiServerClient();

      default:
        throw new Error(`Unknown context: ${context}`);
    }
  }

  private static createMiddlewareClient({
    request,
    response,
  }: MiddlewareSupabaseConfig): SupabaseClient<Database> {
    // HTTPS接続を動的に検出
    const isHttps =
      request.url.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";

    const cookieConfig = getCookieConfig(isHttps);

    return createServerClient<Database>(this.getURL(), this.getAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Next.js Middlewareでは、リクエストとレスポンスの両方に反映する
          cookiesToSet.forEach(({ name, value }) => {
            try {
              request.cookies.set(name, value);
            } catch (_) {
              // ignore – request.cookies may be immutable in some contexts
            }
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              ...cookieConfig,
            });
          });
        },
      },
    }) as unknown as SupabaseClient<Database>;
  }

  private static createApiServerClient(): SupabaseClient<Database> {
    // テスト環境での dynamic import 対応
    let cookieStore: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nextHeaders = require("next/headers");
      cookieStore = nextHeaders.cookies();
    } catch (error) {
      // next/headersが利用できない場合（テスト環境など）は、空のcookieStore実装を提供
      logger.warn("next/headers not available, using empty cookie store", {
        tag: "cookieStoreUnavailable",
        error_message: error instanceof Error ? error.message : String(error),
        environment: process.env.NODE_ENV,
      });

      cookieStore = {
        get: () => undefined,
        getAll: () => [] as { name: string; value: string }[],
        set: () => {},
        delete: () => {},
      };
    }

    return createServerClient<Database>(this.getURL(), this.getAnonKey(), {
      cookies: {
        getAll() {
          try {
            return cookieStore.getAll();
          } catch (_) {
            return [] as { name: string; value: string }[];
          }
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const mergedOptions: CookieOptions = { ...options, ...COOKIE_CONFIG };
              // 明示的なmaxAgeが無い場合のみ、セッションクッキーのmaxAgeを上書き
              if (options.maxAge == null && name === AUTH_CONFIG.cookieNames.session) {
                mergedOptions.maxAge = AUTH_CONFIG.session.maxAge;
              }
              cookieStore.set(name, value, mergedOptions);
            });
          } catch (error) {
            // Server Componentなど書き込み不可の環境では無視
          }
        },
      },
    }) as unknown as SupabaseClient<Database>;
  }

  /**
   * セッション付きクライアント作成（最適化済み）
   */
  static async createOptimizedClient(
    context: "api" | "server"
  ): Promise<{ client: SupabaseClient<Database>; sessionValid: boolean }>;
  static async createOptimizedClient(
    context: "middleware",
    config: MiddlewareSupabaseConfig
  ): Promise<{ client: SupabaseClient<Database>; sessionValid: boolean }>;
  static async createOptimizedClient(
    context: SupabaseContext,
    config?: MiddlewareSupabaseConfig
  ): Promise<{ client: SupabaseClient<Database>; sessionValid: boolean }> {
    const client =
      context === "middleware" && config
        ? this.createServerClient(context, config)
        : context === "api"
          ? this.createServerClient("api")
          : this.createServerClient("server");

    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      const sessionValid = this.sessionManager.isSessionValid(session);

      // セッション更新が必要な場合は背景で実行
      if (session && sessionValid) {
        const sessionId = session.user.id;
        this.sessionManager.backgroundSessionRefresh(client, sessionId);
      }

      return { client, sessionValid };
    } catch (error) {
      logger.warn("Failed to check session validity", {
        tag: "sessionValidityCheckFailed",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        context,
      });
      return { client, sessionValid: false };
    }
  }

  /**
   * セッション統計情報取得
   */
  static getSessionStats() {
    return this.sessionManager.getStats();
  }

  /**
   * セッション管理のクリーンアップ
   */
  static cleanupSession(sessionId: string): void {
    this.sessionManager.cleanupSession(sessionId);
  }
}
