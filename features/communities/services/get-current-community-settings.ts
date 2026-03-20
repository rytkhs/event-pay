import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { getPublicUrl } from "@core/seo/metadata";
import type { AppSupabaseClient } from "@core/types/supabase";

type CommunitySettingsRow = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

export type CurrentCommunitySettingsReadModel = {
  community: {
    description: string | null;
    id: string;
    name: string;
    slug: string;
  };
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
    .select("id, name, description, slug")
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
      name: community.name,
      slug: community.slug,
    },
    publicPageUrl: getPublicUrl(`/c/${community.slug}`),
  });
}
