import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import withBundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

// dev/prod で切り替えた CSP（本番は最終的に Middleware で nonce 付与）
const csp = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com"
    : "script-src 'self' 'unsafe-inline' https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com",
  "script-src-attr 'none'",
  // style は Level 3 を使うなら -elem/-attr に統一
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com https://www.google-analytics.com",
  "font-src 'self' https://fonts.gstatic.com",
  isDev
    ? "connect-src 'self' http://127.0.0.1:54321 https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com https://m.stripe.network https://q.stripe.com https://maps.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com https://m.stripe.network https://q.stripe.com https://maps.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeadersBase = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const securityHeaders = isProd
  ? securityHeadersBase // 本番は CSP を Middleware に任せる
  : [...securityHeadersBase, { key: "Content-Security-Policy", value: csp }];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "@react-email/tailwind": false,
        "@react-email/render": false,
        "react-email": false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...externals, "pino-pretty", "thread-stream"];
      // 可能なら pino の輸送周りをサーバー専用コードに閉じ込める
    }
    return config;
  },

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

  experimental: {
    serverComponentsExternalPackages: ["pino"],
  },
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})(nextConfig);

// 開発時のみ初期化（必要なら environment を指定）
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({
    // environment: "staging", // wrangler.jsonc の env 名に合わせて切替可
  });
}
