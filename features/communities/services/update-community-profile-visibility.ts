import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { UpdateCommunityProfileVisibilityInput } from "../validation";

const UPDATE_COMMUNITY_PROFILE_VISIBILITY_ERROR_MESSAGE =
  "公開プロフィールの表示設定の更新に失敗しました";
const COMMUNITY_NOT_FOUND_MESSAGE = "更新対象のコミュニティが見つかりません";

type UpdatedCommunityProfileVisibilityRow = {
  id: string;
  show_community_link: boolean;
};

export type UpdateCommunityProfileVisibilityResult = {
  communityId: string;
  showCommunityLink: boolean;
};

function toDatabaseError(cause: unknown, ownerUserId: string, communityId: string) {
  logger.error("Community profile visibility update failed", {
    category: "system",
    action: "community.update_profile_visibility",
    outcome: "failure",
    resource_type: "community",
    resource_id: communityId,
    user_id: ownerUserId,
    communityId,
    error: cause,
  });

  return errResult(
    new AppError("DATABASE_ERROR", {
      cause,
      retryable: true,
      userMessage: UPDATE_COMMUNITY_PROFILE_VISIBILITY_ERROR_MESSAGE,
    })
  );
}

export async function updateCommunityProfileVisibility(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  communityId: string,
  input: UpdateCommunityProfileVisibilityInput
): Promise<AppResult<UpdateCommunityProfileVisibilityResult>> {
  const { data, error } = await supabase
    .from("communities")
    .update({
      show_community_link: input.showCommunityLink,
    })
    .eq("id", communityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .select("id, show_community_link")
    .maybeSingle<UpdatedCommunityProfileVisibilityRow>();

  if (error) {
    return toDatabaseError(error, ownerUserId, communityId);
  }

  if (!data) {
    logger.warn("Community profile visibility update target not found", {
      category: "system",
      action: "community.update_profile_visibility",
      outcome: "failure",
      resource_type: "community",
      resource_id: communityId,
      user_id: ownerUserId,
      communityId,
    });

    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: COMMUNITY_NOT_FOUND_MESSAGE,
      })
    );
  }

  logger.info("Community profile visibility updated", {
    category: "system",
    action: "community.update_profile_visibility",
    outcome: "success",
    resource_type: "community",
    resource_id: data.id,
    user_id: ownerUserId,
    communityId: data.id,
  });

  return okResult({
    communityId: data.id,
    showCommunityLink: data.show_community_link,
  });
}
