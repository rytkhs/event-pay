import type { Metadata } from "next";

import { renderMarkdownFromFile } from "@core/utils/markdown";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "利用規約",
    description:
      "みんなの集金の利用規約です。本サービスのご利用にあたって同意いただく事項を定めています。",
    alternates: {
      canonical: "https://minnano-shukin.com/terms",
    },
  };
}

export default async function Page() {
  const { html, frontmatter } = await renderMarkdownFromFile("public/legal/terms.md");
  return (
    <div>
      <h1 className="text-2xl font-bold">{frontmatter.title ?? "利用規約"}</h1>
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
