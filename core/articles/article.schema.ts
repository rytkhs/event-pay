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

export const articleStatusSchema = z.enum(["draft", "published"]);

export const articleFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  publishedAt: dateStringSchema,
  updatedAt: dateStringSchema.optional(),
  status: articleStatusSchema,
  category: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  author: z.string().min(1).optional(),
  heroImage: z.string().min(1).optional(),
});

export function parseArticleFrontmatter(data: unknown, expectedSlug: string) {
  const frontmatter = articleFrontmatterSchema.parse(data);

  if (frontmatter.slug !== expectedSlug) {
    throw new Error(
      `Article slug mismatch: frontmatter slug "${frontmatter.slug}" must match file name "${expectedSlug}"`
    );
  }

  return frontmatter;
}
