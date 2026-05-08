import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { getPublicUrl } from "@core/seo/metadata";
import type { AppSupabaseClient } from "@core/types/supabase";

type CommunitySettingsRow = {
  description: string | null;
  id: string;
  legal_slug: string;
  name: string;
  show_community_link: boolean;
  slug: string;
};

export type CurrentCommunitySettingsReadModel = {
  community: {
    description: string | null;
    id: string;
    legalSlug: string;
    name: string;
    showCommunityLink: boolean;
    slug: string;
  };
  legalPageUrl: string;
  publicPageUrl: string;
};

const GET_CURRENT_COMMUNITY_SETTINGS_ERROR_MESSAGE = "コミュニティ設定の取得に失敗しました";

export async function getCurrentCommunitySettings(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  currentCommunityId: string
): Promise<AppResult<CurrentCommunitySettingsReadModel | null>> {
  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, name, description, slug, legal_slug, show_community_link")
    .eq("id", currentCommunityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .maybeSingle<CommunitySettingsRow>();

  if (communityError) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: communityError,
        details: {
          communityId: currentCommunityId,
          operation: "get_current_community_settings",
          ownerUserId,
        },
        retryable: true,
        userMessage: GET_CURRENT_COMMUNITY_SETTINGS_ERROR_MESSAGE,
      })
    );
  }

  if (!community) {
    return okResult(null);
  }

  return okResult({
    community: {
      description: community.description,
      id: community.id,
      legalSlug: community.legal_slug,
      name: community.name,
      showCommunityLink: community.show_community_link,
      slug: community.slug,
    },
    legalPageUrl: getPublicUrl(`/tokushoho/${community.legal_slug}`),
    publicPageUrl: getPublicUrl(`/c/${community.slug}`),
  });
}
