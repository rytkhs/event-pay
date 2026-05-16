import type { RenderedMarkdown } from "@core/utils/markdown";

type Props = {
  document: RenderedMarkdown;
  fallbackTitle: string;
};

export function LegalDocumentView({ document, fallbackTitle }: Props) {
  const heading = document.frontmatter.title ?? fallbackTitle;

  return (
    <div>
      <h1 className="text-2xl font-bold">{heading}</h1>
      <div className="my-6" dangerouslySetInnerHTML={{ __html: document.html }} />
      {document.frontmatter.lastUpdated ? (
        <p className="text-sm text-muted-foreground">
          最終更新:{" "}
          {new Date(document.frontmatter.lastUpdated).toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      ) : null}
    </div>
  );
}
