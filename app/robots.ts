import type { MetadataRoute } from "next";

// 環境に応じたベースURLを取得
const getBaseUrl = (): string => {
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://minnano-shukin.com"
    );
  }
  return "http://localhost:3000";
};

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/login",
          "/register",
          "/reset-password",
          "/verify-email",
          "/contact",
          "/terms",
          "/privacy",
          "/tokushoho/",
        ],
        disallow: [
          "/guest/",
          "/invite/",
          "/dashboard",
          "/events/",
          "/payments/",
          "/payouts/",
          "/api/",
          "/auth/",
          "/debug",
          "/_next/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
