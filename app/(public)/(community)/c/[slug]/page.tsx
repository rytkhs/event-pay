import Link from "next/link";
import { notFound } from "next/navigation";

import { Metadata } from "next";

import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { getPublicCommunityBySlug } from "@features/communities/server";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityBySlug(supabase, slug);

  if (!result.success || !result.data) {
    return {
      title: "Not Found",
      robots: "noindex, nofollow",
    };
  }

  const community = result.data;

  return {
    title: community.name,
    description: community.description || `${community.name}のコミュニティページです。`,
    robots: "noindex, nofollow",
  };
}

export default async function PublicCommunityPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityBySlug(supabase, slug);

  if (!result.success || !result.data) {
    notFound();
  }

  const community = result.data;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10">
      {/* コミュニティ名 + お問い合わせボタン */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold">{community.name}</h1>
        <Link
          href={`/c/${community.slug}/contact`}
          className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          お問い合わせ
        </Link>
      </div>

      {/* コミュニティについて */}
      <p className="text-lg text-muted-foreground mb-3">コミュニティについて</p>
      <div className="rounded-lg border border-border bg-muted/30 px-5 py-6 min-h-96 text-sm leading-relaxed">
        {community.description ? (
          <p className="whitespace-pre-wrap">{community.description}</p>
        ) : (
          <p className="text-muted-foreground italic text-center mt-6">
            説明はまだ設定されていません。
          </p>
        )}
      </div>
    </div>
  );
}
