import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";

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
