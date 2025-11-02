import type { Metadata } from "next";

import { renderMarkdownFromPublic } from "@core/utils/markdown";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    alternates: {
      canonical: "./",
    },
  };
}

export default async function Page() {
  const { html, frontmatter } = await renderMarkdownFromPublic("/legal/privacy.md");
  return (
    <div>
      <h2>{frontmatter.title ?? "プライバシーポリシー"}</h2>
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
}
