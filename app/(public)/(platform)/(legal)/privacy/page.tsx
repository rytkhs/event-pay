import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";
import { renderMarkdownFromFile } from "@core/utils/markdown";

export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "プライバシーポリシー",
    description:
      "みんなの集金のプライバシーポリシーです。個人情報の取り扱いについて説明しています。",
    alternates: {
      canonical: getPublicUrl("/privacy"),
    },
    openGraph: buildOpenGraphMetadata({
      title: "プライバシーポリシー | みんなの集金",
      description:
        "みんなの集金のプライバシーポリシーです。個人情報の取り扱いについて説明しています。",
      path: "/privacy",
    }),
  };
}

export default async function Page() {
  const { html, frontmatter } = await renderMarkdownFromFile("public/legal/privacy.md");
  return (
    <div>
      <h1 className="text-2xl font-bold">{frontmatter.title ?? "プライバシーポリシー"}</h1>
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
