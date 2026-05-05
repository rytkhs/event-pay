import { describe, expect, it } from "@jest/globals";

import { parseAnnouncementFrontmatter } from "@core/announcements/announcement.schema";

describe("parseAnnouncementFrontmatter", () => {
  it("validates frontmatter and requires the slug to match the file name", () => {
    const frontmatter = parseAnnouncementFrontmatter(
      {
        title: "料金体系改定のお知らせ",
        description: "料金体系改定の対象と適用開始日をお知らせします。",
        slug: "pricing-revision-2026-06",
        publishedAt: "2026-05-01",
        effectiveAt: "2026-06-01",
        status: "published",
        type: "pricing",
        importance: "important",
        audience: ["organizer"],
        tags: ["料金", "手数料"],
      },
      "pricing-revision-2026-06"
    );

    expect(frontmatter.effectiveAt).toBe("2026-06-01");
    expect(frontmatter.audience).toEqual(["organizer"]);
    expect(frontmatter.tags).toEqual(["料金", "手数料"]);
  });

  it("defaults audience and tags to empty arrays", () => {
    const frontmatter = parseAnnouncementFrontmatter(
      {
        title: "メンテナンスのお知らせ",
        description: "メンテナンス予定についてお知らせします。",
        slug: "maintenance-2026-05",
        publishedAt: "2026-05-01",
        status: "published",
        type: "maintenance",
        importance: "normal",
      },
      "maintenance-2026-05"
    );

    expect(frontmatter.audience).toEqual([]);
    expect(frontmatter.tags).toEqual([]);
  });

  it("throws when the slug does not match the file name", () => {
    expect(() =>
      parseAnnouncementFrontmatter(
        {
          title: "料金体系改定のお知らせ",
          description: "料金体系改定の対象と適用開始日をお知らせします。",
          slug: "different-slug",
          publishedAt: "2026-05-01",
          status: "published",
          type: "pricing",
          importance: "important",
        },
        "pricing-revision-2026-06"
      )
    ).toThrow(/slug mismatch/);
  });

  it("throws for invalid type and importance", () => {
    expect(() =>
      parseAnnouncementFrontmatter(
        {
          title: "不正なお知らせ",
          description: "不正な分類を持つお知らせです。",
          slug: "invalid-announcement",
          publishedAt: "2026-05-01",
          status: "published",
          type: "campaign",
          importance: "urgent",
        },
        "invalid-announcement"
      )
    ).toThrow();
  });
});
