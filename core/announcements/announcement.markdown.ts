import matter from "@11ty/gray-matter";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { parseAnnouncementFrontmatter } from "./announcement.schema";

export async function parseAnnouncementMarkdown({
  fileSlug,
  content,
}: {
  fileSlug: string;
  content: string;
}) {
  const parsed = matter(content);
  const frontmatter = parseAnnouncementFrontmatter(parsed.data || {}, fileSlug);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify);

  const file = await processor.process(parsed.content);

  return {
    frontmatter,
    html: String(file.value),
  };
}
