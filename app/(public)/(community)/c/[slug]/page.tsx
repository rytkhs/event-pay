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
    <div>
      <p>{community.name}</p>
      {community.description ? (
        <p>{community.description}</p>
      ) : (
        <p className="text-muted-foreground text-center italic">説明文はまだ設定されていません。</p>
      )}

      <Link href={`/c/${community.slug}/contact`}>主催者へ問い合わせる</Link>
      <Link href={`/tokushoho/${community.legalSlug}`}>特定商取引法に基づく表記</Link>
    </div>
  );
}
