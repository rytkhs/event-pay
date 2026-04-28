import type { WithContext, BlogPosting } from "schema-dts";

import { getPublicUrl, siteName, siteOgImage } from "@core/seo/metadata";

import type { Article } from "./article.types";

export function getArticleImage(article: Pick<Article, "heroImage">) {
  return article.heroImage
    ? {
        url: article.heroImage,
        width: 1200,
        height: 630,
        alt: siteName,
      }
    : siteOgImage;
}

export function generateArticleJsonLd(article: Article): WithContext<BlogPosting> {
  const image = getArticleImage(article);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    url: getPublicUrl(article.path),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    inLanguage: "ja",
    image: getPublicUrl(image.url),
    author: {
      "@type": "Organization",
      name: article.author ?? siteName,
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
