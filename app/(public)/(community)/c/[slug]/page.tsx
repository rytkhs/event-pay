import Link from "next/link";
import { notFound } from "next/navigation";

import { Users, Mail } from "lucide-react";
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
    <main className="container mx-auto max-w-2xl px-4 py-12 md:py-16 flex flex-col gap-8 relative">
      {/* Decorative gradient background (very subtle) */}
      <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none rounded-t-3xl" />

      {/* Header Container */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          {/* Avatar Placeholder */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm rotate-3 hover:rotate-0 transition-transform">
            <Users className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {community.name}
          </h1>
        </div>

        <Link
          href={`/c/${community.slug}/contact`}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-all duration-200 ease-in-out hover:shadow-md active:scale-95"
        >
          <Mail className="h-4 w-4 text-muted-foreground" />
          お問い合わせ
        </Link>
      </header>

      {/* Description Section */}
      <section className="space-y-5 rounded-2xl border border-border/50 bg-card/50 p-6 md:p-8 shadow-sm relative overflow-hidden backdrop-blur-sm">
        {/* Subtle decorative accent line */}
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary/40 to-transparent" />

        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
          コミュニティについて
        </h2>
        <div className="text-base leading-relaxed text-muted-foreground">
          {community.description ? (
            <p className="whitespace-pre-wrap text-foreground/90">{community.description}</p>
          ) : (
            <p className="italic text-sm opacity-80 pl-3 border-l-2 border-muted">
              説明はまだ設定されていません。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
