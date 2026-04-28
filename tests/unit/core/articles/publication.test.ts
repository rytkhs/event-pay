import { describe, expect, it } from "@jest/globals";

import type { ArticleFrontmatter } from "@core/articles/article.types";
import { isArticlePublished } from "@core/articles/publication";

const baseArticle: ArticleFrontmatter = {
  title: "イベント集金をラクにする方法",
  description: "イベント集金の方法を解説します。",
  slug: "event-fee-collection-methods",
  publishedAt: "2026-04-26",
  status: "published",
  tags: [],
};

describe("isArticlePublished", () => {
  it("returns true for a published article whose publish date has passed", () => {
    expect(isArticlePublished(baseArticle, new Date("2026-04-27T00:00:00+09:00"))).toBe(true);
  });

  it("returns false for drafts and future publish dates", () => {
    expect(isArticlePublished({ ...baseArticle, status: "draft" })).toBe(false);
    expect(isArticlePublished(baseArticle, new Date("2026-04-25T00:00:00+09:00"))).toBe(false);
  });
});
