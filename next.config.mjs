/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Edge Runtimeの設定（APIルート用）
    runtime: "edge",
  },
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
      };
    }
    return config;
  },
  // 画像最適化設定
  images: {
    domains: ["localhost"],
    formats: ["image/webp", "image/avif"],
  },
  // 環境変数の公開設定
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
};

export default nextConfig;
