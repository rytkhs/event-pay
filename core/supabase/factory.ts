import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseCookieConfig } from "@core/supabase/config";
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
  private static async getRequestCookieStoreOrThrow(): Promise<CookieStoreLike> {
    try {
      const nextHeaders = (await import("next/headers")) as {
        cookies: () => Promise<CookieStoreLike>;
      };
      return await nextHeaders.cookies();
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

  static createServerClient(context: "server"): Promise<SupabaseClient<Database>>;
  static createServerClient(context: "api"): Promise<SupabaseClient<Database>>;
  static createServerClient(
    context: "middleware",
    config: MiddlewareSupabaseConfig
  ): Promise<SupabaseClient<Database>>;
  static async createServerClient(
    context: SupabaseContext,
    config?: MiddlewareSupabaseConfig
  ): Promise<SupabaseClient<Database>> {
    switch (context) {
      case "middleware":
        if (!config) {
          throw new Error("Middleware context requires request and response objects");
        }
        return this.createMiddlewareClient(config);

      case "api":
        return await this.createRequestServerClient({
          context: "api",
          allowCookieWriteFailure: false,
        });

      case "server":
        return await this.createRequestServerClient({
          context: "server",
          allowCookieWriteFailure: true,
        });

      default:
        throw new Error(`Unknown context: ${context}`);
    }
  }

  private static createMiddlewareClient({
    request,
    response,
  }: MiddlewareSupabaseConfig): SupabaseClient<Database> {
    const cookieConfig = getSupabaseCookieConfig();

    return createServerClient<Database>(this.getURL(), this.getAnonKey(), {
      cookieOptions: cookieConfig,
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
            response.cookies.set(name, value, options);
          });
        },
      },
    }) as unknown as SupabaseClient<Database>;
  }

  private static async createRequestServerClient({
    context,
    allowCookieWriteFailure,
  }: {
    context: "api" | "server";
    allowCookieWriteFailure: boolean;
  }): Promise<SupabaseClient<Database>> {
    const cookieStore = await this.getRequestCookieStoreOrThrow();
    const cookieConfig = getSupabaseCookieConfig();

    return createServerClient<Database>(this.getURL(), this.getAnonKey(), {
      cookieOptions: cookieConfig,
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
              cookieStore.set(name, value, options);
            });
          } catch (error: unknown) {
            if (allowCookieWriteFailure) {
              // Server Componentなど書き込み不可の環境では無視
              return;
            }

            handleServerError("INTERNAL_ERROR", {
              category: "system",
              action: "client_creation",
              actorType: "system",
              additionalData: {
                reason: "COOKIE_WRITE_FAILED",
                context,
                error_message: error instanceof Error ? error.message : String(error),
                environment: getEnv().NODE_ENV,
              },
            });

            throw new Error(
              "Supabase server client failed to write auth cookies. Ensure this runs in a Route Handler or Server Action."
            );
          }
        },
      },
    }) as unknown as SupabaseClient<Database>;
  }
}
