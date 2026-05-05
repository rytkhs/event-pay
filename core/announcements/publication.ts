import { formatInTimeZone } from "date-fns-tz";

import type { AnnouncementFrontmatter } from "./announcement.types";

export const ANNOUNCEMENT_TIME_ZONE = "Asia/Tokyo";

export function getAnnouncementDateToday(now = new Date()): string {
  return formatInTimeZone(now, ANNOUNCEMENT_TIME_ZONE, "yyyy-MM-dd");
}

export function isAnnouncementPublished(
  announcement: AnnouncementFrontmatter,
  now = new Date()
): boolean {
  return (
    announcement.status === "published" && announcement.publishedAt <= getAnnouncementDateToday(now)
  );
}
