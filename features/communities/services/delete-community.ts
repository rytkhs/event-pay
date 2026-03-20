import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { AppSupabaseClient } from "@core/types/supabase";

const DELETE_COMMUNITY_ERROR_MESSAGE = "コミュニティの削除に失敗しました";
const DELETE_COMMUNITY_NOT_FOUND_MESSAGE = "削除対象のコミュニティが見つかりません";
const REPRESENTATIVE_COMMUNITY_IN_USE_MESSAGE =
  "代表コミュニティに設定されているため削除できません。付け替え後に削除してください";

type DeletedCommunityRow = {
  id: string;
};

export type DeleteCommunityResult = {
  communityId: string;
};

function toDatabaseError(
  cause: unknown,
  details?: Record<string, string | number | boolean | null>
) {
  return errResult(
    new AppError("DATABASE_ERROR", {
      cause,
      details,
      retryable: true,
      userMessage: DELETE_COMMUNITY_ERROR_MESSAGE,
    })
  );
}

async function ensureCommunityIsNotRepresentative(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  communityId: string
): Promise<AppResult<void>> {
  const { count, error } = await supabase
    .from("payout_profiles")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .eq("representative_community_id", communityId);

  if (error) {
    return toDatabaseError(error, {
      communityId,
      operation: "count_representative_community_usage",
    });
  }

  if ((count ?? 0) > 0) {
    return errResult(
      new AppError("RESOURCE_CONFLICT", {
        details: {
          communityId,
          operation: "delete_representative_community",
        },
        retryable: false,
        userMessage: REPRESENTATIVE_COMMUNITY_IN_USE_MESSAGE,
      })
    );
  }

  return okResult(undefined);
}

export async function deleteCommunity(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  communityId: string
): Promise<AppResult<DeleteCommunityResult>> {
  const representativeCheckResult = await ensureCommunityIsNotRepresentative(
    supabase,
    ownerUserId,
    communityId
  );

  if (!representativeCheckResult.success) {
    return representativeCheckResult;
  }

  const { data, error } = await supabase
    .from("communities")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", communityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle<DeletedCommunityRow>();

  if (error) {
    return toDatabaseError(error, {
      communityId,
      operation: "soft_delete_community",
    });
  }

  if (!data) {
    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: DELETE_COMMUNITY_NOT_FOUND_MESSAGE,
      })
    );
  }

  return okResult({
    communityId: data.id,
  });
}
