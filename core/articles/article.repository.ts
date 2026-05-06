import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { cache } from "react";

import { parseArticleMarkdown } from "./article.markdown";
import type { Article, ArticleSummary } from "./article.types";
import { isArticlePublished } from "./publication";

const ARTICLES_DIR = path.join(process.cwd(), "content/articles");
const ARTICLE_EXTENSION = ".md";

function getSlugFromFileName(fileName: string): string {
  return fileName.slice(0, -ARTICLE_EXTENSION.length);
}

function buildArticlePath(slug: string): `/articles/${string}` {
  return `/articles/${slug}`;
}

function sortByPublishedAtDesc(a: ArticleSummary, b: ArticleSummary): number {
  return b.publishedAt.localeCompare(a.publishedAt);
}

export const getAllArticles = cache(async (): Promise<Article[]> => {
  const fileNames = (await fs.readdir(ARTICLES_DIR))
    .filter((fileName) => fileName.endsWith(ARTICLE_EXTENSION))
    .sort();

  const articles = await Promise.all(
    fileNames.map(async (fileName) => {
      const fileSlug = getSlugFromFileName(fileName);
      const content = await fs.readFile(path.join(ARTICLES_DIR, fileName), "utf8");
      const parsed = await parseArticleMarkdown({ fileSlug, content });

      return {
        ...parsed.frontmatter,
        html: parsed.html,
        path: buildArticlePath(parsed.frontmatter.slug),
      };
    })
  );

  return articles.sort(sortByPublishedAtDesc);
});

export async function getPublishedArticles(now = new Date()): Promise<ArticleSummary[]> {
  const articles = await getAllArticles();
  return articles.filter((article) => isArticlePublished(article, now)).map(toArticleSummary);
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const articles = await getAllArticles();
  const article = articles.find((item) => item.slug === slug);

  if (!article || !isArticlePublished(article)) {
    return null;
  }

  return article;
}

export async function getArticleStaticParams(): Promise<Array<{ slug: string }>> {
  const articles = await getPublishedArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

function toArticleSummary(article: Article): ArticleSummary {
  const { html: _html, ...summary } = article;
  return summary;
}
