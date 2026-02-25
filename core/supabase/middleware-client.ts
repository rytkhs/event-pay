import { NextRequest, NextResponse } from "next/server";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseCookieConfig } from "@core/supabase/config";

import type { Database } from "@/types/database";

export interface MiddlewareSupabaseConfig {
  request: NextRequest;
  response: NextResponse;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function createMiddlewareSupabaseClient({
  request,
  response,
  supabaseUrl,
  supabaseAnonKey,
}: MiddlewareSupabaseConfig): SupabaseClient<Database> {
  const cookieConfig = getSupabaseCookieConfig();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
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
