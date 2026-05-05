import type { z } from "zod";

import type {
  announcementAudienceSchema,
  announcementFrontmatterSchema,
  announcementImportanceSchema,
  announcementStatusSchema,
  announcementTypeSchema,
} from "./announcement.schema";

export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
export type AnnouncementType = z.infer<typeof announcementTypeSchema>;
export type AnnouncementImportance = z.infer<typeof announcementImportanceSchema>;
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;
export type AnnouncementFrontmatter = z.infer<typeof announcementFrontmatterSchema>;

export type AnnouncementSummary = AnnouncementFrontmatter & {
  path: `/announcements/${string}`;
  readingMinutes: number;
};

export type Announcement = AnnouncementSummary & {
  html: string;
};
