/**
 * ヘッダー認証ユーティリティ関数
 * RLS関数で使用するカスタムヘッダーを管理
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";

import type { Database } from "@/types/database";

/**
 * 認証ヘッダーのオプション
 */
export interface AuthHeaderOptions {
  inviteToken?: string;
  guestToken?: string;
}

/**
 * 認証用カスタムヘッダーを作成
 */
export function createAuthHeaders(options: AuthHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options.inviteToken) {
    headers["x-invite-token"] = options.inviteToken;
  }

  if (options.guestToken) {
    headers["x-guest-token"] = options.guestToken;
  }

  return headers;
}

/**
 * カスタムヘッダー付きのSupabaseクライアントを作成
 * RLS関数と連携して認証を行う
 */
export function createClientWithAuth(options: AuthHeaderOptions = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing required Supabase environment variables");
  }

  const customHeaders = createAuthHeaders(options);

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: customHeaders,
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * Server Components用：リクエストヘッダーからトークンを抽出
 */
export function extractAuthTokensFromHeaders(headers: Headers): AuthHeaderOptions {
  return {
    inviteToken: headers.get("x-invite-token") || undefined,
    guestToken: headers.get("x-guest-token") || undefined,
  };
}

/**
 * デバッグ用：設定されているヘッダーを確認
 */
export function debugAuthHeaders(options: AuthHeaderOptions): void {
  if (process.env.NODE_ENV === "development") {
    logger.debug("Auth Headers Debug", {
      tag: "auth-headers",
      invite_token: options.inviteToken ? `${options.inviteToken.substring(0, 8)}...` : "None",
      guest_token: options.guestToken ? `${options.guestToken.substring(0, 8)}...` : "None",
    });
  }
}
