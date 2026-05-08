import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { UpdateCommunityBasicInfoInput } from "../validation";

const UPDATE_COMMUNITY_BASIC_INFO_ERROR_MESSAGE = "コミュニティの更新に失敗しました";
const COMMUNITY_NOT_FOUND_MESSAGE = "更新対象のコミュニティが見つかりません";

type UpdatedCommunityBasicInfoRow = {
  description: string | null;
  id: string;
  name: string;
};

export type UpdateCommunityBasicInfoResult = {
  communityId: string;
  description: string | null;
  name: string;
};

function toDatabaseError(cause: unknown, ownerUserId: string, communityId: string) {
  logger.error("Community basic info update failed", {
    category: "system",
    action: "community.update_basic_info",
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
      userMessage: UPDATE_COMMUNITY_BASIC_INFO_ERROR_MESSAGE,
    })
  );
}

export async function updateCommunityBasicInfo(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  communityId: string,
  input: UpdateCommunityBasicInfoInput
): Promise<AppResult<UpdateCommunityBasicInfoResult>> {
  const { data, error } = await supabase
    .from("communities")
    .update({
      description: input.description,
      name: input.name,
    })
    .eq("id", communityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .select("id, name, description")
    .maybeSingle<UpdatedCommunityBasicInfoRow>();

  if (error) {
    return toDatabaseError(error, ownerUserId, communityId);
  }

  if (!data) {
    logger.warn("Community basic info update target not found", {
      category: "system",
      action: "community.update_basic_info",
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

  logger.info("Community basic info updated", {
    category: "system",
    action: "community.update_basic_info",
    outcome: "success",
    resource_type: "community",
    resource_id: data.id,
    user_id: ownerUserId,
    communityId: data.id,
  });

  return okResult({
    communityId: data.id,
    description: data.description,
    name: data.name,
  });
}
