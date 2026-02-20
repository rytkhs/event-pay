import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";

  return [
    {
      url: baseUrl,
      lastModified: "2026-02-17",
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: "2025-11-21",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: "2025-11-21",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: "2025-11-25",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/tokushoho/platform`,
      lastModified: "2025-11-21",
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
