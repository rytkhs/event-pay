import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { getOrganizerTokushohoLegalDocument } from "@core/legal/documents";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { getPublicCommunityByLegalSlug } from "@features/communities/server";

type Props = {
  params: Promise<{ legalSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { legalSlug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityByLegalSlug(supabase, legalSlug);

  if (!result.success || !result.data) {
    return {
      title: "Not Found",
      robots: "noindex, nofollow",
    };
  }

  const community = result.data;

  return {
    title: `特定商取引法に基づく表記 - ${community.name}`,
    description: `${community.name}の特定商取引法に基づく表記です。`,
    robots: "noindex, nofollow",
  };
}

export default async function Page({ params }: Props) {
  const { legalSlug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const communityResult = await getPublicCommunityByLegalSlug(supabase, legalSlug);

  if (!communityResult.success || !communityResult.data) {
    notFound();
  }

  const community = communityResult.data;
  const document = await getOrganizerTokushohoLegalDocument();
  const heading = document.frontmatter.title ?? "特定商取引法に基づく表記";

  return (
    <div className="animate-in fade-in duration-500">
      <div className="space-y-4 mb-3">
        <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
        <p className="text-md text-muted-foreground">
          コミュニティ: <span className="font-semibold text-foreground">{community.name}</span>
        </p>
      </div>

      <div className="my-6" dangerouslySetInnerHTML={{ __html: document.html }} />

      {document.frontmatter.lastUpdated ? (
        <p className="text-sm text-muted-foreground mt-10 pt-6 border-t font-medium">
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
