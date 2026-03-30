import type { ReactNode } from "react";

import { notFound } from "next/navigation";

import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { getPublicCommunityByLegalSlug } from "@features/communities/server";

import { PublicCommunityShell } from "@components/layout/PublicCommunityShell";

type Props = {
  children: ReactNode;
  params: Promise<{ legalSlug: string }>;
};

export default async function LegalLayout({ children, params }: Props) {
  const { legalSlug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityByLegalSlug(supabase, legalSlug);

  if (!result.success || !result.data) {
    notFound();
  }

  const community = result.data;

  return (
    <PublicCommunityShell communitySlug={community.slug} legalSlug={community.legalSlug}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <article
          className="
          prose
          prose-neutral
          max-w-none
          dark:prose-invert
          prose-p:leading-tight
          prose-p:my-2
          prose-h2:text-base
          prose-h2:font-semibold
          prose-h2:leading-tight
          prose-h2:mt-4
          prose-h2:mb-2
          prose-li:leading-tight
          prose-li:my-1"
        >
          {children}
        </article>
      </div>
    </PublicCommunityShell>
  );
}
