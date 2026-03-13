import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return [
    {
      url: `${appUrl}`,
      lastModified: "2026-03-09",
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${appUrl}/contact`,
      lastModified: "2025-11-21",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${appUrl}/terms`,
      lastModified: "2025-11-21",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${appUrl}/privacy`,
      lastModified: "2025-11-25",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${appUrl}/tokushoho/platform`,
      lastModified: "2026-03-14",
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
