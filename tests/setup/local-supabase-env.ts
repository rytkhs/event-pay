import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * ローカル Supabase の接続情報を、生成ファイルから allowlist で読み出す。
 *
 * 生成元は `pnpm test:db:prepare`。`.env` / `.env.local` の cascade は使用しない
 * （live Stripe キーや QStash / Upstash のトークンがテストプロセスへ混入するため）。
 */

const GENERATED_ENV_URL = new URL("../.env.local-supabase", import.meta.url);
const GENERATED_ENV_PATH = fileURLToPath(GENERATED_ENV_URL);
const RELATIVE_ENV_PATH = "tests/.env.local-supabase";

const ALLOWED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const PREPARE_HINT = `\`pnpm test:db:prepare\` を実行してローカル Supabase の接続情報を生成してください。`;

function stripQuotes(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'") && value.length >= 2 && value.at(-1) === first) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());
    entries.set(key, value);
  }

  return entries;
}

function assertLocalHost(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(
      `${RELATIVE_ENV_PATH} の NEXT_PUBLIC_SUPABASE_URL が URL として不正です: ${url}`
    );
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${RELATIVE_ENV_PATH} の NEXT_PUBLIC_SUPABASE_URL がローカルスタックを指していません（host: ${host}）。` +
        `テストはローカル Supabase に対してのみ実行できます。`
    );
  }
}

/**
 * 生成ファイルから3キーを読み出す。
 *
 * - ファイルが無い / 3キーが揃わない場合は `null`（prepare 未実行）
 * - URL がローカルホスト以外を指す場合は即座に throw する
 */
export function readLocalSupabaseEnv(): Record<AllowedKey, string> | null {
  let content: string;
  try {
    content = readFileSync(GENERATED_ENV_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const parsed = parseEnvFile(content);

  const url = parsed.get("NEXT_PUBLIC_SUPABASE_URL");
  if (url) assertLocalHost(url);

  const env = {} as Record<AllowedKey, string>;
  for (const key of ALLOWED_KEYS) {
    const value = parsed.get(key);
    if (!value) return null;
    env[key] = value;
  }

  return env;
}

/**
 * `db` / `integration` プロジェクトの globalSetup。
 *
 * prepare 未実行の状態でテストが走ることを防ぐ。
 * ここで Supabase のリセット・起動は行わない（DB ライフサイクルは prepare の責務）。
 */
export function setup(): void {
  if (readLocalSupabaseEnv() !== null) return;

  throw new Error(
    `ローカル Supabase の接続情報が見つかりません（${RELATIVE_ENV_PATH}）。${PREPARE_HINT}`
  );
}
