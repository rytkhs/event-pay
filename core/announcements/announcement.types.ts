import type { z } from "zod";

import type {
  announcementFrontmatterSchema,
  announcementStatusSchema,
} from "./announcement.schema";

export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
export type AnnouncementFrontmatter = z.infer<typeof announcementFrontmatterSchema>;

export type AnnouncementSummary = AnnouncementFrontmatter & {
  path: `/announcements/${string}`;
};

export type Announcement = AnnouncementSummary & {
  html: string;
};
