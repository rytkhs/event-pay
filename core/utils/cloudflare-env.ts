/**
 * Cloudflare環境変数アクセスヘルパー
 * getCloudflareContext().envへの統一的なアクセスを提供
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare環境変数にアクセスするためのヘルパー関数
 * @returns Cloudflare環境変数オブジェクト
 */
export function getEnv() {
  return getCloudflareContext().env;
}
