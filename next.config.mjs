import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

// 本番ではMiddleware等で毎リクエスト一意のnonceを生成してScript/Styleに付与し、
// CSPの 'unsafe-inline' を除去する構成への移行を推奨（本ファイルはヘッダー側のみで完結する安全側の暫定案）
const csp = [
  "default-src 'self'",
  // プレビューを安定させるため、暫定的に常時 'unsafe-inline' を許可（本番はnonce化で撤廃予定）
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com"
    : "script-src 'self' 'unsafe-inline' https://js.stripe.com https://maps.googleapis.com",
  // インライン属性のスクリプトは許可しない
  "script-src-attr 'none'",
  // Styleは可能ならnonce/hashへ移行（当面は最小限の 'unsafe-inline' を許可）
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  // 画像はMaps等の第三者ドメインとdata/blobを許可
  "img-src 'self' data: blob: https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Supabase/Stripe/Maps等への接続
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com https://maps.googleapis.com",
  // Stripeの3Dセキュア等を考慮してframe許可
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  // セキュリティ強化
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  // クリックジャッキング対策（X-Frame-Optionsと整合）
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // クリックジャッキング対策（CSPのframe-ancestorsと整合）
  { key: "X-Frame-Options", value: "DENY" },
  // MIMEスニッフィング無効化
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 推奨リファラーポリシー
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 必要最小限の機能のみ許可（Topics APIも明示的に無効化）
  {
    key: "Permissions-Policy",
    value: [
      "geolocation=()",
      "microphone=()",
      "camera=()",
      "payment=(self)",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "browsing-topics=()",
    ].join(", "),
  },
  // CSP（本番はnonce運用へ移行し 'unsafe-inline' を撤廃すること）
  { key: "Content-Security-Policy", value: csp },
  // HSTS（preloadは実際にプリロードリストへ登録済みであることが前提）
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  // セキュリティヘッダー
  async headers() {
    // 本番はCSPをmiddlewareの動的ヘッダーに一元化（ここではCSPを発行しない）
    const isProd = process.env.NODE_ENV === "production";
    const headersForAll = securityHeaders.filter((h) => h.key !== "Content-Security-Policy");
    const headersToSend = isProd ? headersForAll : securityHeaders;
    return [
      {
        source: "/(.*)",
        headers: headersToSend,
      },
    ];
  },

  // Webpack設定の最適化
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Webpack 5ではNodeコアの自動ポリフィルは無効化済みだが、混入防止の明示
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    // Pino / thread-stream を外部扱いにしてサーバーバンドルから外す（dev の worker 解決エラー回避）
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...externals, "pino-pretty", "thread-stream"];
    }
    return config;
  },

  // 画像最適化設定（セキュリティ強化）
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      { protocol: "https", hostname: "maps.gstatic.com" },
      { protocol: "https", hostname: "*.googleapis.com" },
      { protocol: "https", hostname: "*.ggpht.com" },
    ],
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
