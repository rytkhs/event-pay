/**
 * Cloudflare環境変数アクセスヘルパー
 * getCloudflareContext().envへの統一的なアクセスを提供
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

let cachedEnv: ReturnType<typeof getCloudflareContext>["env"] | undefined;

/**
 * Cloudflare環境変数にアクセスするためのヘルパー関数
 * @returns Cloudflare環境変数オブジェクト
 */
export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = getCloudflareContext().env;
  }
  return cachedEnv;
}

/**
 * Cloudflare環境変数にアクセスするための非同期ヘルパー関数（ISR/SSG向け）
 *
 * 注意事項:
 * - 静的ルート（ISR/SSG）や、実行時に静的コンテキストからバインディングへアクセスする必要がある場合に使用してください。
 * - モジュールのトップレベルでは呼び出さず、必ず関数スコープ内で `await` してください。
 * - 一般的なリクエスト（動的ルート・API・Middleware 等）では同期版の `getEnv()` を使用できます。
 */
export async function getEnvAsync() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env;
  } catch {
    return process.env as unknown as Record<string, string | undefined>;
  }
}
