import { describe, expect, it } from "@jest/globals";

import { parseArticleFrontmatter } from "@core/articles/article.schema";

describe("parseArticleFrontmatter", () => {
  it("validates frontmatter and requires the slug to match the file name", () => {
    const frontmatter = parseArticleFrontmatter(
      {
        title: "イベント集金をラクにする方法",
        description: "イベント集金の方法を解説します。",
        slug: "event-fee-collection-methods",
        publishedAt: "2026-04-26",
        status: "published",
      },
      "event-fee-collection-methods"
    );

    expect(frontmatter.tags).toEqual([]);
  });

  it("throws when the slug does not match the file name", () => {
    expect(() =>
      parseArticleFrontmatter(
        {
          title: "イベント集金をラクにする方法",
          description: "イベント集金の方法を解説します。",
          slug: "different-slug",
          publishedAt: "2026-04-26",
          status: "published",
        },
        "event-fee-collection-methods"
      )
    ).toThrow(/slug mismatch/);
  });
});
