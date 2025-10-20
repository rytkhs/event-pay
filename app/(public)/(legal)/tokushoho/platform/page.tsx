import { renderMarkdownFromPublic } from "@core/utils/markdown";

export const dynamic = "force-static";

export default async function Page() {
  const { html, frontmatter } = await renderMarkdownFromPublic("/legal/tokushoho/platform.md");
  const heading = frontmatter.title ?? "特定商取引法に基づく表記";

  return (
    <div>
      <h2>{heading}</h2>
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
