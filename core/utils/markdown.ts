import "server-only";

import matter from "@11ty/gray-matter";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export type MarkdownFrontmatter = {
  title?: string;
  lastUpdated?: string;
  [key: string]: unknown;
};

export type RenderedMarkdown = {
  html: string;
  frontmatter: MarkdownFrontmatter;
};

export async function renderMarkdownFromString(content: string) {
  const parsed = matter(content);

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify);

  const file = await processor.process(parsed.content);
  return {
    html: String(file.value),
    frontmatter: (parsed.data || {}) as MarkdownFrontmatter,
  };
}
