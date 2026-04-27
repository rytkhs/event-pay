import { formatInTimeZone } from "date-fns-tz";

import type { ArticleFrontmatter } from "./article.types";

export const ARTICLE_TIME_ZONE = "Asia/Tokyo";

export function getArticleDateToday(now = new Date()): string {
  return formatInTimeZone(now, ARTICLE_TIME_ZONE, "yyyy-MM-dd");
}

export function isArticlePublished(article: ArticleFrontmatter, now = new Date()): boolean {
  return article.status === "published" && article.publishedAt <= getArticleDateToday(now);
}
