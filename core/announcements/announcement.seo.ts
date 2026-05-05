import type { Article, WithContext } from "schema-dts";

import { getPublicUrl, siteName, siteOgImage } from "@core/seo/metadata";

import type { Announcement } from "./announcement.types";

export function generateAnnouncementJsonLd(announcement: Announcement): WithContext<Article> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: announcement.title,
    description: announcement.description,
    url: getPublicUrl(announcement.path),
    datePublished: announcement.publishedAt,
    dateModified: announcement.updatedAt ?? announcement.publishedAt,
    inLanguage: "ja",
    image: getPublicUrl(siteOgImage.url),
    author: {
      "@type": "Organization",
      name: siteName,
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
      logo: {
        "@type": "ImageObject",
        url: getPublicUrl("/icon-512.png"),
      },
    },
  };
}
