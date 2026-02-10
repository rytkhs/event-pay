import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

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

export async function renderMarkdownFromFile(relativePath: string) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await fs.readFile(absolutePath, "utf8");
  return renderMarkdownFromString(content);
}

async function renderMarkdownFromString(content: string) {
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

export async function renderMarkdownFromPublic(pathFromPublicRoot: string) {
  // Build absolute URL for same-origin fetch in server context
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = new URL(pathFromPublicRoot, base);
  const res = await fetch(url.toString(), { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url.toString()}: ${res.status}`);
  }
  const md = await res.text();
  return renderMarkdownFromString(md);
}
