import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { renderMarkdownFromPublic } from "@core/utils/markdown";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "特定商取引法に基づく表記",
    robots: "noindex, nofollow",
  };
}

export default async function Page() {
  try {
    const { html, frontmatter } = await renderMarkdownFromPublic("/legal/tokushoho/organizer.md");
    const heading = frontmatter.title ?? "特定商取引法に基づく表記";
    return (
      <div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <div className="my-6" dangerouslySetInnerHTML={{ __html: html }} />
        {frontmatter.lastUpdated ? (
          <p className="text-sm text-muted-foreground">
            最終更新:{" "}
            {new Date(frontmatter.lastUpdated).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        ) : null}
      </div>
    );
  } catch {
    notFound();
  }
}
