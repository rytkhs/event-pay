/**
 * デモ環境から本番環境へリダイレクトするパス
 *
 * これらのパスにアクセスすると、middleware が /demo-redirect ページへ転送し、
 * クライアントサイドで本番環境の同一パスへリダイレクトする。
 * 主にマーケティングページや法的ページが対象。
 *
 * @see middleware.ts - getDemoAction()
 */
export const DEMO_REDIRECT_PATHS = ["/", "/terms", "/privacy", "/contact", "/tokushoho/platform"];

/**
 * クライアントサイドリダイレクトで許可されるパス（オープンリダイレクト対策）
 *
 * demo-redirect ページで使用。URL パラメータ ?to= の値がこのリストに
 * 含まれる場合のみリダイレクトを許可し、それ以外はトップページへ。
 * DEMO_REDIRECT_PATHS に加え、未ログイン時の /login, /register も含む。
 *
 * @see app/demo-redirect/page.tsx
 */
export const DEMO_CLIENT_REDIRECT_ALLOWLIST = [
  ...DEMO_REDIRECT_PATHS,
  // 注意: /login, /register は未ログイン時のみ本番環境へリダイレクトされる
  // （middleware.ts の認証ガードで処理）。ログイン済みの場合はダッシュボードへ。
  "/login",
  "/register",
];

/**
 * デモ環境でアクセスを許可するパスプレフィックス
 *
 * これらのプレフィックスに一致するパスはデモ環境内でそのまま表示される。
 * 一致しないパスは 404 を返す（直接URL入力によるアクセス防止）。
 *
 * @see middleware.ts - getDemoAction()
 */
export const DEMO_ALLOWED_PREFIXES = [
  "/demo-redirect",
  "/dashboard",
  "/events",
  "/settings",
  "/invite/",
  "/guest/",
  "/start-demo",
  "/login",
  "/register",
];
