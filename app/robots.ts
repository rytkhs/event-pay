import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";

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
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
