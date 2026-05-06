import { describe, expect, it } from "@jest/globals";

import type { AnnouncementFrontmatter } from "@core/announcements/announcement.types";
import { isAnnouncementPublished } from "@core/announcements/publication";

const baseAnnouncement: AnnouncementFrontmatter = {
  title: "料金体系改定のお知らせ",
  description: "料金体系改定の対象と適用開始日をお知らせします。",
  slug: "pricing-revision-2026-06",
  publishedAt: "2026-05-01",
  status: "published",
};

describe("isAnnouncementPublished", () => {
  it("returns true for a published announcement whose publish date has passed", () => {
    expect(isAnnouncementPublished(baseAnnouncement, new Date("2026-05-01T00:00:00+09:00"))).toBe(
      true
    );
  });

  it("returns false for draft announcements and future publish dates", () => {
    expect(isAnnouncementPublished({ ...baseAnnouncement, status: "draft" })).toBe(false);
    expect(isAnnouncementPublished(baseAnnouncement, new Date("2026-04-30T23:59:59+09:00"))).toBe(
      false
    );
  });

  it("uses Asia/Tokyo as the current-date boundary", () => {
    expect(isAnnouncementPublished(baseAnnouncement, new Date("2026-04-30T15:00:00Z"))).toBe(true);
  });
});
