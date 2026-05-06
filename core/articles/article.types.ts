import type { z } from "zod";

import type { articleFrontmatterSchema, articleStatusSchema } from "./article.schema";

export type ArticleStatus = z.infer<typeof articleStatusSchema>;
export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;

export type ArticleSummary = ArticleFrontmatter & {
  path: `/articles/${string}`;
};

export type Article = ArticleSummary & {
  html: string;
};
