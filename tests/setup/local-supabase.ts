import { createServerClient, type CookieOptions } from "@supabase/ssr";
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

export type TestCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export type TestCookieJar = {
  getAll(): TestCookie[];
  setAll(cookies: TestCookie[]): void;
};

export function createTestCookieJar(initialCookies: TestCookie[] = []): TestCookieJar {
  const cookies = new Map(initialCookies.map((cookie) => [cookie.name, { ...cookie }]));

  return {
    getAll: () => [...cookies.values()].map((cookie) => ({ ...cookie })),
    setAll: (nextCookies) => {
      for (const cookie of nextCookies) {
        if (cookie.value === "" || cookie.options?.maxAge === 0) {
          cookies.delete(cookie.name);
          continue;
        }
        cookies.set(cookie.name, { ...cookie });
      }
    },
  };
}

/** @supabase/ssr の公開APIで、Next.jsと同じCookie storageを使うテストクライアントを作る。 */
export function createLocalSsrClient(cookieJar: TestCookieJar): AppSupabaseClient {
  const { url, anonKey } = requireLocalSupabaseEnv();

  return createServerClient<AppDatabase>(url, anonKey, {
    auth: AUTH_OPTIONS,
    cookies: {
      getAll: () => cookieJar.getAll(),
      setAll: (cookies) => cookieJar.setAll(cookies),
    },
  });
}

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
