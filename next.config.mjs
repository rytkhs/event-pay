/** @type {import('next').NextConfig} */
const nextConfig = {
  // セキュリティヘッダーの設定
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
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
            ].join(", "),
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // EventPay決済システム特化のscript-src設定
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com"
                : "script-src 'self' 'nonce-eventpay' https://js.stripe.com https://maps.googleapis.com",
              // DOMPurify対応のstyle-src設定
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // 画像・メディア設定
              "font-src 'self' https://fonts.gstatic.com",
              // EventPay API・Supabase・Stripe接続設定
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://checkout.stripe.com wss://*.supabase.co",
              // Stripe決済フレーム設定
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              // セキュリティ強化設定
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.stripe.com",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
              // DOMPurify XSS対策強化
              "script-src-attr 'none'",
              // 開発環境では'unsafe-inline'を許可、本番環境ではnonceベース
              process.env.NODE_ENV === "development"
                ? "script-src-elem 'self' 'unsafe-inline' https://js.stripe.com"
                : "script-src-elem 'self' 'nonce-eventpay' https://js.stripe.com",
              "style-src-attr 'unsafe-inline'",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  // Webpack設定の最適化
  webpack: (config, { isServer }) => {
    if (!isServer) {
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
    domains: ["localhost"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
