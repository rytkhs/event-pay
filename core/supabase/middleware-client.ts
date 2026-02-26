import { NextRequest, NextResponse } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseCookieConfig } from "@core/supabase/config";

import type { Database } from "@/types/database";

export interface MiddlewareSupabaseConfig {
  request: NextRequest;
  requestHeaders: Headers;
  response: NextResponse;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface MiddlewareSupabaseClient {
  supabase: SupabaseClient<Database>;
  getResponse: () => NextResponse;
}

export function createMiddlewareSupabaseClient({
  request,
  requestHeaders,
  response,
  supabaseUrl,
  supabaseAnonKey,
}: MiddlewareSupabaseConfig): MiddlewareSupabaseClient {
  const cookieConfig = getSupabaseCookieConfig();
  let middlewareResponse = response;
  const requestCookieStore = new Map<string, string>();

  request.cookies.getAll().forEach(({ name, value }) => {
    requestCookieStore.set(name, value);
  });

  const serializeRequestCookies = (cookies: Array<{ name: string; value: string }>): string => {
    return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  };

  const isCookieRemoval = (options: CookieOptions): boolean => {
    if (typeof options.maxAge === "number" && options.maxAge <= 0) {
      return true;
    }

    if (options.expires) {
      const expiresAt =
        options.expires instanceof Date ? options.expires : new Date(options.expires);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
        return true;
      }
    }

    return false;
  };

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: cookieConfig,
    cookies: {
      getAll() {
        return Array.from(requestCookieStore.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        // Next.js Middlewareでは、リクエストとレスポンスの両方に反映する
        cookiesToSet.forEach(({ name, value, options }) => {
          if (isCookieRemoval(options)) {
            requestCookieStore.delete(name);
          } else {
            requestCookieStore.set(name, value);
          }

          try {
            request.cookies.set(name, value);
          } catch {
            // Middlewareの一部コンテキストではrequest.cookiesがimmutableなため無視する
          }
        });

        const previousResponse = middlewareResponse;
        const nextRequestHeaders = new Headers(requestHeaders);
        const cookieHeader = serializeRequestCookies(
          Array.from(requestCookieStore.entries()).map(([name, value]) => ({ name, value }))
        );
        if (cookieHeader) {
          nextRequestHeaders.set("cookie", cookieHeader);
        } else {
          nextRequestHeaders.delete("cookie");
        }

        middlewareResponse = NextResponse.next({
          request: {
            headers: nextRequestHeaders,
          },
        });

        previousResponse.headers.forEach((value, key) => {
          const normalizedKey = key.toLowerCase();
          if (normalizedKey === "set-cookie") return;
          if (normalizedKey === "x-middleware-set-cookie") return;
          if (normalizedKey === "x-middleware-override-headers") return;
          if (normalizedKey.startsWith("x-middleware-request-")) return;

          middlewareResponse.headers.set(key, value);
        });

        previousResponse.cookies.getAll().forEach((cookie) => {
          middlewareResponse.cookies.set(cookie);
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            middlewareResponse.cookies.set(name, value, options);
          } catch (error: unknown) {
            throw new Error(
              `Failed to set auth cookie on middleware response: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        });
      },
    },
  });

  return {
    supabase,
    getResponse() {
      return middlewareResponse;
    },
  };
}
