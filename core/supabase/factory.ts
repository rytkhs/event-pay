import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { getSessionManager } from "@core/session/manager";
import { SUPABASE_COOKIE_CONFIG, getSupabaseCookieConfig } from "@core/supabase/config";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";

import type { Database } from "@/types/database";

type SupabaseContext = "middleware" | "api" | "server";

interface MiddlewareSupabaseConfig {
  request: NextRequest;
  response: NextResponse;
}

interface CookieStoreLike {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: CookieOptions): void;
}

export class SupabaseClientFactory {
  private static sessionManager = getSessionManager();

  private static getRequestCookieStoreOrThrow(): CookieStoreLike {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nextHeaders = require("next/headers") as {
        cookies: () => CookieStoreLike;
      };
      return nextHeaders.cookies();
    } catch (error) {
      const message =
        "Supabase server client requires next/headers cookies() in a server request context.";

      handleServerError("INTERNAL_ERROR", {
        category: "system",
        action: "client_creation",
        actorType: "system",
        additionalData: {
          reason: "NEXT_HEADERS_UNAVAILABLE",
          error_message: error instanceof Error ? error.message : String(error),
          environment: getEnv().NODE_ENV,
        },
      });

      throw new Error(message);
    }
  }

  private static getURL(): string {
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

  private static getAnonKey(): string {
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

    const cookieConfig = getSupabaseCookieConfig(isHttps);

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
    const cookieStore = this.getRequestCookieStoreOrThrow();

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
              const mergedOptions: CookieOptions = { ...options, ...SUPABASE_COOKIE_CONFIG };
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
        category: "system",
        action: "session_validation",
        actor_type: "system",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        context,
        outcome: "failure",
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
