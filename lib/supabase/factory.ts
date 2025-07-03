import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionManager } from "@/lib/session/manager";
import { COOKIE_CONFIG, AUTH_CONFIG, getCookieConfig } from "@/config/security";

export type SupabaseContext = "middleware" | "api" | "server";

export interface MiddlewareSupabaseConfig {
  request: NextRequest;
  response: NextResponse;
}

export class SupabaseClientFactory {
  private static readonly URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  private static readonly ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  private static sessionManager = getSessionManager();

  static createServerClient(context: "server"): SupabaseClient;
  static createServerClient(context: "api"): SupabaseClient;
  static createServerClient(
    context: "middleware",
    config: MiddlewareSupabaseConfig
  ): SupabaseClient;
  static createServerClient(
    context: SupabaseContext,
    config?: MiddlewareSupabaseConfig
  ): SupabaseClient {
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
  }: MiddlewareSupabaseConfig): SupabaseClient {
    // HTTPS接続を動的に検出
    const isHttps =
      request.url.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";

    const cookieConfig = getCookieConfig(isHttps);

    return createServerClient(this.URL, this.ANON_KEY, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set(name, value, {
            ...options,
            ...cookieConfig,
          });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.delete({ name, ...options });
        },
      },
    });
  }

  private static createApiServerClient(): SupabaseClient {
    const cookieStore = cookies();

    return createServerClient(this.URL, this.ANON_KEY, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, {
            ...options,
            ...COOKIE_CONFIG,
            maxAge:
              name === AUTH_CONFIG.cookieNames.session
                ? AUTH_CONFIG.session.maxAge
                : options.maxAge != null
                  ? options.maxAge
                  : undefined,
          });
        },
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
    });
  }

  /**
   * セッション付きクライアント作成（最適化済み）
   */
  static async createOptimizedClient(
    context: "api" | "server"
  ): Promise<{ client: SupabaseClient; sessionValid: boolean }>;
  static async createOptimizedClient(
    context: "middleware",
    config: MiddlewareSupabaseConfig
  ): Promise<{ client: SupabaseClient; sessionValid: boolean }>;
  static async createOptimizedClient(
    context: SupabaseContext,
    config?: MiddlewareSupabaseConfig
  ): Promise<{ client: SupabaseClient; sessionValid: boolean }> {
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
      // eslint-disable-next-line no-console
      console.warn("Failed to check session validity:", error);
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
