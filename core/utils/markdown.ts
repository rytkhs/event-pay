import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function renderMarkdownFromFile(relativePath: string) {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await fs.readFile(absolutePath, "utf8");
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

export async function renderFirstExistingMarkdownFile(
  relativePaths: string[]
): Promise<{ result: RenderedMarkdown; usedPath: string } | null> {
  for (const rel of relativePaths) {
    const abs = path.resolve(process.cwd(), rel);
    if (await fileExists(abs)) {
      const result = await renderMarkdownFromFile(rel);
      return { result, usedPath: rel };
    }
  }
  return null;
}

export async function listMarkdownSlugsUnder(directoryRelativePath: string): Promise<string[]> {
  const absolute = path.resolve(process.cwd(), directoryRelativePath);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("_"))
    .map((e) => e.name.replace(/\.md$/, ""));
}
