import { notFound } from "next/navigation";

import { createClient } from "@core/supabase/server";
import { renderMarkdownFromFile } from "@core/utils/markdown";
import { sanitizeForEventPay } from "@core/utils/sanitize";

export const dynamic = "force-dynamic";

type Params = { organizer: string };

export default async function Page({ params }: { params: Params }) {
  try {
    const { html, frontmatter } = await renderMarkdownFromFile(
      "content/legal/tokushoho/organizer.md"
    );
    // 主催者ニックネーム取得（未認証でも呼べる範囲でベストエフォート）
    let organizerNickname = "";
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_event_creator_name", {
        p_creator_id: params.organizer,
      });
      if (!error && data) {
        organizerNickname = sanitizeForEventPay(String(data)).trim();
      }
    } catch {
      // 取得失敗時は空のまま（プレースホルダーだけ除去）
    }

    const injectedHtml = html.replace(/\{\{ORGANIZER_NICKNAME\}\}/g, organizerNickname);
    const heading = frontmatter.title ?? "特定商取引法に基づく表記";
    return (
      <div>
        <h2>{heading}</h2>
        <div className="my-6" dangerouslySetInnerHTML={{ __html: injectedHtml }} />
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
