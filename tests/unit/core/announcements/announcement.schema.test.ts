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
      },
      "pricing-revision-2026-06"
    );

    expect(frontmatter.effectiveAt).toBe("2026-06-01");
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
        },
        "pricing-revision-2026-06"
      )
    ).toThrow(/slug mismatch/);
  });

  it("throws for an invalid publish status", () => {
    expect(() =>
      parseAnnouncementFrontmatter(
        {
          title: "不正なお知らせ",
          description: "不正な公開状態を持つお知らせです。",
          slug: "invalid-announcement",
          publishedAt: "2026-05-01",
          status: "ready",
        },
        "invalid-announcement"
      )
    ).toThrow();
  });

  it("throws for unsupported metadata fields", () => {
    expect(() =>
      parseAnnouncementFrontmatter(
        {
          title: "料金体系改定のお知らせ",
          description: "料金体系改定の対象と適用開始日をお知らせします。",
          slug: "pricing-revision-2026-06",
          publishedAt: "2026-05-01",
          status: "published",
          type: "pricing",
        },
        "pricing-revision-2026-06"
      )
    ).toThrow();
  });
});
