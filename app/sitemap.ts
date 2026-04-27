import type { MetadataRoute } from "next";

import { getPublishedArticles } from "@core/articles/article.repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const articles = await getPublishedArticles();

  return [
    {
      url: `${appUrl}`,
      lastModified: "2026-04-21",
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
      lastModified: "2026-04-21",
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
      lastModified: "2026-04-21",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${appUrl}/articles`,
      lastModified: "2026-04-26",
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...articles.map((article) => ({
      url: `${appUrl}${article.path}`,
      lastModified: article.updatedAt ?? article.publishedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
