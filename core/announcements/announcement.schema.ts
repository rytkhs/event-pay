import { z } from "zod";

const dateStringSchema = z.preprocess(
  (value) => {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return value;
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください")
);

export const announcementStatusSchema = z.enum(["draft", "published"]);

export const announcementFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).max(180),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    publishedAt: dateStringSchema,
    updatedAt: dateStringSchema.optional(),
    effectiveAt: dateStringSchema.optional(),
    status: announcementStatusSchema,
  })
  .strict();

export function parseAnnouncementFrontmatter(data: unknown, expectedSlug: string) {
  const frontmatter = announcementFrontmatterSchema.parse(data);

  if (frontmatter.slug !== expectedSlug) {
    throw new Error(
      `Announcement slug mismatch: frontmatter slug "${frontmatter.slug}" must match file name "${expectedSlug}"`
    );
  }

  return frontmatter;
}
