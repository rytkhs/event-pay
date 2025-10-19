/**
 * キャッシュヘルパー関数
 * Next.js App Router環境でのReact.cache()の適切な使用をサポート
 */

import { cache } from "react";

/**
 * 本番環境でのみReact.cache()を適用するヘルパー関数
 * 開発環境では元の関数をそのまま返すことで、デバッグを容易にする
 */
function conditionalCache<T extends (...args: never[]) => unknown>(fn: T): T {
  const isProduction = process.env.NODE_ENV === "production";
  return (isProduction ? cache(fn) : fn) as T;
}

/**
 * 複数の関数に対して一括でキャッシュを適用するヘルパー関数
 */
export function createCachedActions<T extends Record<string, (...args: never[]) => unknown>>(
  actions: T
): T {
  const cachedActions = {} as T;

  for (const [key, action] of Object.entries(actions)) {
    (cachedActions as Record<string, unknown>)[key] = conditionalCache(
      action as (...args: never[]) => unknown
    );
  }

  return cachedActions;
}
