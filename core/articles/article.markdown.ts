import matter from "@11ty/gray-matter";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { parseArticleFrontmatter } from "./article.schema";

function estimateReadingMinutes(markdown: string): number {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[#>*_`[\]()!-]/g, "")
    .replace(/\s+/g, "");

  return Math.max(1, Math.ceil(plainText.length / 600));
}

export async function parseArticleMarkdown({
  fileSlug,
  content,
}: {
  fileSlug: string;
  content: string;
}) {
  const parsed = matter(content);
  const frontmatter = parseArticleFrontmatter(parsed.data || {}, fileSlug);
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
    readingMinutes: estimateReadingMinutes(parsed.content),
  };
}
