import type { ReactNode } from "react";

import { notFound } from "next/navigation";

import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { getPublicCommunityBySlug } from "@features/communities/server";

import { PublicCommunityShell } from "@components/layout/PublicCommunityShell";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function CommunitySlugLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityBySlug(supabase, slug);

  if (!result.success || !result.data) {
    notFound();
  }

  const community = result.data;

  return (
    <PublicCommunityShell communitySlug={community.slug} legalSlug={community.legalSlug}>
      {children}
    </PublicCommunityShell>
  );
}
