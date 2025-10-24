/**
 * Cloudflare環境変数アクセスヘルパー
 * getCloudflareContext().envへの統一的なアクセスを提供
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { logger } from "@core/logging/app-logger";

/**
 * Cloudflare環境変数にアクセスするためのヘルパー関数
 * @returns Cloudflare環境変数オブジェクト
 */
export function getEnv() {
  try {
    const envKeys = Object.keys(process.env);
    logger.debug("process.envを使用", {
      tag: "envAccess",
      source: "process",
      envKeys: envKeys,
      envCount: envKeys.length,
    });
    return process.env as unknown as Record<string, string | undefined>;
  } catch {
    const env = getCloudflareContext().env;
    const envKeys = Object.keys(env);
    logger.debug("Cloudflare環境変数を使用", {
      tag: "envAccess",
      source: "cloudflare",
      envKeys: envKeys,
      envCount: envKeys.length,
    });
    return env;
  }
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
    const envKeys = Object.keys(env);
    logger.debug("Cloudflare環境変数を使用（非同期）", {
      tag: "envAccess",
      source: "cloudflare",
      async: true,
      envKeys: envKeys,
      envCount: envKeys.length,
    });
    return env;
  } catch {
    const envKeys = Object.keys(process.env);
    logger.debug("process.envをフォールバックとして使用（非同期）", {
      tag: "envAccess",
      source: "process",
      async: true,
      envKeys: envKeys,
      envCount: envKeys.length,
    });
    return process.env as unknown as Record<string, string | undefined>;
  }
}
