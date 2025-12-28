/**
 * CSP (Content Security Policy) 設定モジュール
 *
 * 許可ドメインとCSPディレクティブを一元管理し、
 * SSG（静的）/動的ページで適切なCSPを生成する。
 *
 * @see https://www.w3.org/TR/CSP3/
 * @see https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */

export type CspMode = "static" | "dynamic";

/**
 * 許可ドメイン定数
 * 各サービスごとにグループ化
 */
export const ALLOWED_ORIGINS = {
  /** Stripe決済関連 */
  stripeScripts: ["https://js.stripe.com", "https://connect-js.stripe.com"],
  stripeConnect: [
    "https://api.stripe.com",
    "https://checkout.stripe.com",
    "https://connect.stripe.com",
    "https://express.stripe.com",
    "https://dashboard.stripe.com",
    "https://connect-js.stripe.com",
    "https://m.stripe.network",
    "https://q.stripe.com",
  ],
  stripeFrames: [
    "https://hooks.stripe.com",
    "https://checkout.stripe.com",
    "https://js.stripe.com",
    "https://connect.stripe.com",
    "https://express.stripe.com",
  ],

  /** Google Tag Manager / Analytics */
  gtm: ["https://*.googletagmanager.com"],
  ga: ["https://*.google-analytics.com", "https://*.analytics.google.com"],

  /** Google Maps */
  maps: [
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.ggpht.com",
  ],

  /** Supabase */
  supabase: ["https://*.supabase.co", "wss://*.supabase.co"],

  /** Cloudflare Insights */
  cloudflareInsights: ["https://static.cloudflareinsights.com", "https://cloudflareinsights.com"],

  /** Google Fonts */
  fonts: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],

  /** 自社アプリケーションドメイン (クロスオリジン通信用) */
  app: ["https://minnano-shukin.com", "https://demo.minnano-shukin.com"],

  /** ローカル開発用 */
  localDev: ["http://127.0.0.1:54321"],
} as const;

/**
 * 許可するインラインスタイルのHash
 * ライブラリ（vaulなど）が注入するCSSを許可するために使用
 */
export const ALLOWED_HASHES = [
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", // vaul (Drawer)
  "'sha256-YIjArHm2rkb5J7hX9lUM1bnQ3Kp61MTfluMGkuyKwDw='", // vaul (Drawer)
  "'sha256-kAApudxpTi9mfjlC9lC8ZaS9xFHU9/NLLbB173MU7SU='", // vaul (Drawer)
  "'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='", // Radix UI (Dropdown/Dialog scroll lock)
];

/**
 * スペース区切りで結合
 */
function joinSrc(list: readonly string[]): string {
  return list.join(" ");
}

/**
 * CSPビルドパラメータ
 */
export interface BuildCspParams {
  /** ページモード: static（SSG）または dynamic（App Router動的） */
  mode: CspMode;
  /** 動的ページ用のnonce値（staticでは不要） */
  nonce?: string | null;
  /** 開発環境フラグ（ローカルSupabaseを許可） */
  isDev?: boolean;
}

/**
 * CSPディレクティブ文字列を生成
 *
 * @param params - ビルドパラメータ
 * @returns CSPディレクティブ文字列（セミコロン区切り）
 *
 * @example
 * // 静的ページ用
 * const csp = buildCsp({ mode: 'static' });
 *
 * @example
 * // 動的ページ用（nonce付き）
 * const csp = buildCsp({ mode: 'dynamic', nonce: 'abc123' });
 */
export function buildCsp(params: BuildCspParams): string {
  const { mode, nonce, isDev = false } = params;

  // script-src に含める外部ドメイン
  const scriptOrigins = [
    ...ALLOWED_ORIGINS.stripeScripts,
    ...ALLOWED_ORIGINS.gtm,
    ...ALLOWED_ORIGINS.cloudflareInsights,
    ALLOWED_ORIGINS.maps[0], // maps.googleapis.com
  ];

  // script-src: 動的ページはnonce + strict-dynamic、静的ページは'unsafe-inline'を許可（Next.jsハイドレーション用）
  const scriptSrc =
    mode === "dynamic" && nonce
      ? `script-src 'self' 'nonce-${nonce}' ${joinSrc(scriptOrigins)} 'strict-dynamic'`
      : `script-src 'self' 'unsafe-inline' ${joinSrc(scriptOrigins)}`;

  // connect-src: API/WebSocket接続先
  const connectSrcBase = [
    "'self'",
    ...ALLOWED_ORIGINS.app,
    ...ALLOWED_ORIGINS.supabase,
    ...ALLOWED_ORIGINS.stripeConnect,
    ALLOWED_ORIGINS.maps[0], // maps.googleapis.com
    ...ALLOWED_ORIGINS.ga,
    ...ALLOWED_ORIGINS.gtm,
    ...ALLOWED_ORIGINS.cloudflareInsights,
  ];
  const connectSrc = `connect-src ${joinSrc(
    isDev ? [...ALLOWED_ORIGINS.localDev, ...connectSrcBase] : connectSrcBase
  )}`;

  // style-src-elem: 動的ページはnonce、静的ページは'unsafe-inline'を許可（Next.jsハイドレーション用）
  // 特定のライブラリ（vaul等）のためにハッシュも許可
  const styleElem =
    mode === "dynamic" && nonce
      ? `style-src-elem 'self' 'nonce-${nonce}' ${ALLOWED_ORIGINS.fonts[0]} ${joinSrc(ALLOWED_HASHES)}`
      : `style-src-elem 'self' 'unsafe-inline' ${ALLOWED_ORIGINS.fonts[0]}`;

  // img-src: 画像ソース
  const imgSrc = `img-src 'self' data: blob: ${joinSrc([
    ...ALLOWED_ORIGINS.maps,
    ...ALLOWED_ORIGINS.ga,
    ...ALLOWED_ORIGINS.gtm,
  ])}`;

  // frame-src: iframe埋め込み許可（Stripe 3DS/Checkout）
  const frameSrc = `frame-src 'self' ${joinSrc(ALLOWED_ORIGINS.stripeFrames)}`;

  // font-src: Webフォント
  const fontSrc = `font-src 'self' ${ALLOWED_ORIGINS.fonts[1]}`;

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "script-src-attr 'none'",
    styleElem,
    "style-src-attr 'unsafe-inline'",
    imgSrc,
    fontSrc,
    connectSrc,
    frameSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}
