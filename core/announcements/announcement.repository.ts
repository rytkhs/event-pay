import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { cache } from "react";

import { parseAnnouncementMarkdown } from "./announcement.markdown";
import type { Announcement, AnnouncementSummary } from "./announcement.types";
import { isAnnouncementPublished } from "./publication";

const ANNOUNCEMENTS_DIR = path.join(process.cwd(), "content/announcements");
const ANNOUNCEMENT_EXTENSION = ".md";

function getSlugFromFileName(fileName: string): string {
  return fileName.slice(0, -ANNOUNCEMENT_EXTENSION.length);
}

function buildAnnouncementPath(slug: string): `/announcements/${string}` {
  return `/announcements/${slug}`;
}

function sortByPublishedAtDesc(a: AnnouncementSummary, b: AnnouncementSummary): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}

export const getAllAnnouncements = cache(async (): Promise<Announcement[]> => {
  const fileNames = (await fs.readdir(ANNOUNCEMENTS_DIR))
    .filter((fileName) => fileName.endsWith(ANNOUNCEMENT_EXTENSION))
    .sort();

  const announcements = await Promise.all(
    fileNames.map(async (fileName) => {
      const fileSlug = getSlugFromFileName(fileName);
      const content = await fs.readFile(path.join(ANNOUNCEMENTS_DIR, fileName), "utf8");
      const parsed = await parseAnnouncementMarkdown({ fileSlug, content });

      return {
        ...parsed.frontmatter,
        html: parsed.html,
        path: buildAnnouncementPath(parsed.frontmatter.slug),
      };
    })
  );

  return announcements.sort(sortByPublishedAtDesc);
});

export async function getPublishedAnnouncements(now = new Date()): Promise<AnnouncementSummary[]> {
  const announcements = await getAllAnnouncements();
  return announcements
    .filter((announcement) => isAnnouncementPublished(announcement, now))
    .map(toAnnouncementSummary);
}

export async function getPublishedAnnouncementBySlug(slug: string): Promise<Announcement | null> {
  const announcements = await getAllAnnouncements();
  const announcement = announcements.find((item) => item.slug === slug);

  if (!announcement || !isAnnouncementPublished(announcement)) {
    return null;
  }

  return announcement;
}

export async function getAnnouncementStaticParams(): Promise<Array<{ slug: string }>> {
  const announcements = await getPublishedAnnouncements();
  return announcements.map((announcement) => ({ slug: announcement.slug }));
}

function toAnnouncementSummary(announcement: Announcement): AnnouncementSummary {
  const { html: _html, ...summary } = announcement;
  return summary;
}
