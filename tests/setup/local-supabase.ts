import { createClient } from "@supabase/supabase-js";

import type { AppDatabase, AppSupabaseClient } from "@core/types/supabase";

import { requireLocalSupabaseEnv } from "./test-environment";

/**
 * ローカル Supabase 向けのクライアント生成。
 *
 * 本番の `createAuditedAdminClient`（`core/security/secure-client-factory.impl.ts`）は使わない。
 * `server-only` であり、監査行の書き込みという本番の副作用が発生するため。
 *
 * env の読み出しは関数呼び出し時に行う。モジュールトップレベルで読まないことで、
 * env を持たない unit プロジェクトから誤って import されても失敗しない。
 * クライアントは呼び出しごとに新規生成し、モジュールスコープへ保持しない。
 */

const AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/** service_role キーのクライアント。RLS を迂回するため fixture のセットアップ／後始末に使う。 */
export function createLocalAdminClient(): AppSupabaseClient {
  const { url, serviceRoleKey } = requireLocalSupabaseEnv();

  return createClient<AppDatabase>(url, serviceRoleKey, { auth: AUTH_OPTIONS });
}

/** anon キーのクライアント。未認証のまま使うか、サインインして認証済みクライアントにする。 */
export function createLocalAnonClient(): AppSupabaseClient {
  const { url, anonKey } = requireLocalSupabaseEnv();

  return createClient<AppDatabase>(url, anonKey, { auth: AUTH_OPTIONS });
}
