import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { AppSupabaseClient } from "@core/types/supabase";

type PublicCommunityRow = {
  description: string | null;
  name: string;
  slug: string;
  legal_slug: string;
};

export type PublicCommunityReadModel = {
  description: string | null;
  name: string;
  slug: string;
  legalSlug: string;
};

const GET_PUBLIC_COMMUNITY_ERROR_MESSAGE = "コミュニティ情報の取得に失敗しました";

function toReadModel(row: PublicCommunityRow): PublicCommunityReadModel {
  return {
    description: row.description,
    name: row.name,
    slug: row.slug,
    legalSlug: row.legal_slug,
  };
}

export async function getPublicCommunityBySlug(
  supabase: AppSupabaseClient,
  slug: string
): Promise<AppResult<PublicCommunityReadModel | null>> {
  const { data: community, error } = await supabase
    .from("communities")
    .select("name, description, slug, legal_slug")
    .eq("slug", slug)
    .eq("is_deleted", false)
    .maybeSingle<PublicCommunityRow>();

  if (error) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        details: { operation: "get_public_community_by_slug", slug },
        retryable: true,
        userMessage: GET_PUBLIC_COMMUNITY_ERROR_MESSAGE,
      })
    );
  }

  if (!community) {
    return okResult(null);
  }

  return okResult(toReadModel(community));
}

export async function getPublicCommunityByLegalSlug(
  supabase: AppSupabaseClient,
  legalSlug: string
): Promise<AppResult<PublicCommunityReadModel | null>> {
  const { data: community, error } = await supabase
    .from("communities")
    .select("name, description, slug, legal_slug")
    .eq("legal_slug", legalSlug)
    .eq("is_deleted", false)
    .maybeSingle<PublicCommunityRow>();

  if (error) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        details: { operation: "get_public_community_by_legal_slug", legalSlug },
        retryable: true,
        userMessage: GET_PUBLIC_COMMUNITY_ERROR_MESSAGE,
      })
    );
  }

  if (!community) {
    return okResult(null);
  }

  return okResult(toReadModel(community));
}
