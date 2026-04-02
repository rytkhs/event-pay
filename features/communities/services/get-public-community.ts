import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { AppSupabaseClient } from "@core/types/supabase";

type PublicCommunityRow = {
  id: string;
  description: string | null;
  name: string;
  slug: string;
  legal_slug: string;
};

export type PublicCommunityReadModel = {
  id: string;
  description: string | null;
  name: string;
  slug: string;
  legalSlug: string;
};

const GET_PUBLIC_COMMUNITY_ERROR_MESSAGE = "コミュニティ情報の取得に失敗しました";

function toReadModel(row: PublicCommunityRow): PublicCommunityReadModel {
  return {
    id: row.id,
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
  const { data, error } = await supabase.rpc("rpc_public_get_community_by_slug", {
    p_slug: slug,
  });

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

  const community = (data?.[0] as PublicCommunityRow | undefined) ?? null;

  if (!community) {
    return okResult(null);
  }

  return okResult(toReadModel(community));
}

export async function getPublicCommunityByLegalSlug(
  supabase: AppSupabaseClient,
  legalSlug: string
): Promise<AppResult<PublicCommunityReadModel | null>> {
  const { data, error } = await supabase.rpc("rpc_public_get_community_by_legal_slug", {
    p_legal_slug: legalSlug,
  });

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

  const community = (data?.[0] as PublicCommunityRow | undefined) ?? null;

  if (!community) {
    return okResult(null);
  }

  return okResult(toReadModel(community));
}
