import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { UpdateCommunityLegalDisclosureVisibilityInput } from "../validation";

const UPDATE_COMMUNITY_LEGAL_DISCLOSURE_VISIBILITY_ERROR_MESSAGE =
  "特定商取引法に基づく表記リンクの表示設定の更新に失敗しました";
const COMMUNITY_NOT_FOUND_MESSAGE = "更新対象のコミュニティが見つかりません";

type UpdatedCommunityLegalDisclosureVisibilityRow = {
  id: string;
  show_legal_disclosure_link: boolean;
};

export type UpdateCommunityLegalDisclosureVisibilityResult = {
  communityId: string;
  showLegalDisclosureLink: boolean;
};

function toDatabaseError(cause: unknown, ownerUserId: string, communityId: string) {
  logger.error("Community legal disclosure visibility update failed", {
    category: "system",
    action: "community.update_legal_disclosure_visibility",
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
      userMessage: UPDATE_COMMUNITY_LEGAL_DISCLOSURE_VISIBILITY_ERROR_MESSAGE,
    })
  );
}

export async function updateCommunityLegalDisclosureVisibility(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  communityId: string,
  input: UpdateCommunityLegalDisclosureVisibilityInput
): Promise<AppResult<UpdateCommunityLegalDisclosureVisibilityResult>> {
  const { data, error } = await supabase
    .from("communities")
    .update({
      show_legal_disclosure_link: input.showLegalDisclosureLink,
    } as never)
    .eq("id", communityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .select("id, show_legal_disclosure_link")
    .maybeSingle<UpdatedCommunityLegalDisclosureVisibilityRow>();

  if (error) {
    return toDatabaseError(error, ownerUserId, communityId);
  }

  if (!data) {
    logger.warn("Community legal disclosure visibility update target not found", {
      category: "system",
      action: "community.update_legal_disclosure_visibility",
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

  logger.info("Community legal disclosure visibility updated", {
    category: "system",
    action: "community.update_legal_disclosure_visibility",
    outcome: "success",
    resource_type: "community",
    resource_id: data.id,
    user_id: ownerUserId,
    communityId: data.id,
  });

  return okResult({
    communityId: data.id,
    showLegalDisclosureLink: data.show_legal_disclosure_link,
  });
}
