import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";

  if (isDemo) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: undefined,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/events/", "/payments/", "/payouts/", "/api/", "/auth/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
