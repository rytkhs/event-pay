import Link from "next/link";
import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { buildOpenGraphMetadata, getPublicUrl } from "@core/seo/metadata";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { getPublicCommunityBySlug } from "@features/communities/server";

import { CommunityContactForm } from "./CommunityContactForm";

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

  return {
    title: `${result.data.name}へのお問い合わせ`,
    description: `${result.data.name}の主催者へ問い合わせるためのフォームです。`,
    robots: "noindex, nofollow",
    alternates: {
      canonical: getPublicUrl(`/c/${result.data.slug}/contact`),
    },
    openGraph: buildOpenGraphMetadata({
      title: `${result.data.name}へのお問い合わせ`,
      description: `${result.data.name}へ問い合わせるためのフォームです。`,
      path: `/c/${result.data.slug}/contact`,
    }),
  };
}

export default async function CommunityContactPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityBySlug(supabase, slug);

  if (!result.success || !result.data) {
    notFound();
  }

  const community = result.data;

  return (
    <div className="min-h-screen bg-muted/30 py-12">
      <div className="container mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-16 sm:px-6 lg:px-8">
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold text-primary">コミュニティへのお問い合わせ</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {community.name}へのお問い合わせは以下のフォームをご利用ください。
          </p>
        </div>

        <CommunityContactForm communitySlug={community.slug} />

        <div className="rounded-lg border bg-background/80 p-4 text-sm text-muted-foreground">
          プラットフォームへのお問い合わせは
          <Link href="/contact" className="mx-1 text-primary underline-offset-4 hover:underline">
            みんなの集金のお問い合わせフォーム
          </Link>
          をご利用ください。
        </div>
      </div>
    </div>
  );
}
