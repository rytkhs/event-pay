import { assertLocalSupabaseUrl, PREPARE_HINT } from "./local-supabase-env";

/**
 * `db` / `integration` プロジェクトの setupFiles。
 *
 * #493 の config 側ガード（`globalSetup`）は別プロセスで動くため、
 * ここでは worker プロセス内の `process.env` を独立に検証する（多重防御）。
 * fixture が最初の書き込みを行う前に、テストファイル単位で失敗させる。
 *
 * Supabase の起動・リセットは行わない（DB ライフサイクルは prepare の責務）。
 */

const ENV_SOURCE = "テストプロセスの環境変数";

export type LocalSupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

function requireKey(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${ENV_SOURCE} に ${key} がありません。${PREPARE_HINT}`);
  }

  return value;
}

/**
 * ローカル Supabase の3キーを `process.env` から読み出す。
 *
 * - 欠落時は prepare を促すメッセージで throw する
 * - URL がローカルホスト以外を指す場合は throw する
 */
export function requireLocalSupabaseEnv(): LocalSupabaseEnv {
  const url = requireKey("NEXT_PUBLIC_SUPABASE_URL");
  assertLocalSupabaseUrl(url, ENV_SOURCE);

  return {
    url,
    anonKey: requireKey("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: requireKey("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

requireLocalSupabaseEnv();
