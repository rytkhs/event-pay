/**
 * Stripe Connect 関連ルート定数とヘルパー
 */

/** ダッシュボード内の固定パス（現在の配置） */
export const CONNECT_REFRESH_PATH = "/dashboard/connect/refresh" as const;
export const CONNECT_RETURN_PATH = "/dashboard/connect/return" as const;

/** サフィックス（将来サブパスへ移動しても許容するための終端一致用） */
export const CONNECT_REFRESH_SUFFIX = "/connect/refresh" as const;
export const CONNECT_RETURN_SUFFIX = "/connect/return" as const;

/**
 * 指定されたパス名が期待するサフィックスで終端しているかを判定
 * 末尾スラッシュは無視して比較する
 */
export function isAllowedConnectPath(pathname: string, expectedSuffix: string): boolean {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized.endsWith(expectedSuffix);
}
