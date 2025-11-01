/**
 * Canonical URL生成ユーティリティ
 *
 * 環境に応じたベースURLとパスからcanonical URLを生成します。
 * クエリパラメータは除外し、パスのみをcanonical URLとして設定します。
 */

/**
 * 環境に応じたベースURLを取得
 * app/layout.tsxと同じロジックを使用
 */
function getBaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://minnano-shukin.com"
    );
  }
  return "http://localhost:3000";
}

/**
 * パスからcanonical URLを生成
 *
 * @param path - canonical URLとして設定するパス（先頭のスラッシュを含む）
 * @returns canonical URL（完全なURL）
 *
 * @example
 * ```ts
 * getCanonicalUrl("/") // "https://minnano-shukin.com/"
 * getCanonicalUrl("/contact") // "https://minnano-shukin.com/contact"
 * getCanonicalUrl("/invite/abc123") // "https://minnano-shukin.com/invite/abc123"
 * ```
 */
export function getCanonicalUrl(path: string): string {
  const baseUrl = getBaseUrl();

  // パスが先頭スラッシュを含んでいない場合は追加
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // URLを生成（クエリパラメータは自動的に除外される）
  const canonicalUrl = new URL(normalizedPath, baseUrl);

  return canonicalUrl.toString();
}
