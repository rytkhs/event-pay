import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseCookieConfig } from "@core/supabase/config";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";

import type { Database } from "@/types/database";

type SupabaseRequestContext = "route_handler" | "server_action" | "server_component";

interface CookieStoreLike {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: CookieOptions): void;
}

async function getRequestCookieStoreOrThrow(): Promise<CookieStoreLike> {
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

function getURL(): string {
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

async function createRequestServerClient({
  context,
  allowCookieWriteFailure,
}: {
  context: SupabaseRequestContext;
  allowCookieWriteFailure: boolean;
}): Promise<SupabaseClient<Database>> {
  const cookieStore = await getRequestCookieStoreOrThrow();
  const cookieConfig = getSupabaseCookieConfig();

  return createServerClient<Database>(getURL(), getAnonKey(), {
    cookieOptions: cookieConfig,
    cookies: {
      getAll() {
        return cookieStore.getAll();
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

export async function createRouteHandlerSupabaseClient(): Promise<SupabaseClient<Database>> {
  return await createRequestServerClient({
    context: "route_handler",
    allowCookieWriteFailure: false,
  });
}

export async function createServerActionSupabaseClient(): Promise<SupabaseClient<Database>> {
  return await createRequestServerClient({
    context: "server_action",
    allowCookieWriteFailure: false,
  });
}

export async function createServerComponentSupabaseClient(): Promise<SupabaseClient<Database>> {
  return await createRequestServerClient({
    context: "server_component",
    allowCookieWriteFailure: true,
  });
}
