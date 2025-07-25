/**
 * キャッシュヘルパー関数
 * Next.js App Router環境でのReact.cache()の適切な使用をサポート
 */

import { cache } from "react";

/**
 * 本番環境でのみReact.cache()を適用するヘルパー関数
 * 開発環境では元の関数をそのまま返すことで、デバッグを容易にする
 */
export function conditionalCache<T extends (...args: any[]) => any>(fn: T): T {
  return (process.env.NODE_ENV === "production" ? cache(fn) : fn) as T;
}

/**
 * 複数の関数に対して一括でキャッシュを適用するヘルパー関数
 */
export function createCachedActions<T extends Record<string, (...args: any[]) => any>>(
  actions: T
): T {
  const cachedActions = {} as T;

  for (const [key, action] of Object.entries(actions)) {
    (cachedActions as any)[key] = conditionalCache(action);
  }

  return cachedActions;
}
