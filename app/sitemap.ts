import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://minnano-shukin.com";

  return [
    {
      url: baseUrl,
      lastModified: "2025-11-26",
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: "2025-11-26",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: "2025-11-26",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/reset-password`,
      lastModified: "2025-11-26",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/verify-email`,
      lastModified: "2025-11-26",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: "2025-11-21",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: "2025-11-21",
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: "2025-11-25",
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/tokushoho/platform`,
      lastModified: "2025-11-21",
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
