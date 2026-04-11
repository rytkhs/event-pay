import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { AppSupabaseClient } from "@core/types/supabase";

const DELETE_COMMUNITY_ERROR_MESSAGE = "コミュニティの削除に失敗しました";
const DELETE_COMMUNITY_NOT_FOUND_MESSAGE = "削除対象のコミュニティが見つかりません";
const REPRESENTATIVE_COMMUNITY_IN_USE_MESSAGE =
  "代表コミュニティに設定されているため削除できません。付け替え後に削除してください";

export type DeleteCommunityResult = {
  communityId: string;
};

type ExistingCommunityRow = {
  id: string;
};

function toDatabaseError(
  cause: unknown,
  ownerUserId: string,
  details?: Record<string, string | number | boolean | null>
) {
  logger.error("Community delete failed", {
    category: "system",
    action: "community.delete",
    outcome: "failure",
    user_id: ownerUserId,
    resource_type: details?.communityId ? "community" : undefined,
    resource_id: details?.communityId?.toString(),
    communityId: details?.communityId?.toString() ?? null,
    error: cause,
    ...details,
  });

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
    return toDatabaseError(error, ownerUserId, {
      communityId,
      operation: "count_representative_community_usage",
    });
  }

  if ((count ?? 0) > 0) {
    logger.warn(REPRESENTATIVE_COMMUNITY_IN_USE_MESSAGE, {
      category: "system",
      action: "community.delete",
      outcome: "failure",
      resource_type: "community",
      resource_id: communityId,
      communityId,
      user_id: ownerUserId,
      reason: "representative_community_in_use",
    });
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

  const { data: existingCommunity, error: existingCommunityError } = await supabase
    .from("communities")
    .select("id")
    .eq("id", communityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .maybeSingle<ExistingCommunityRow>();

  if (existingCommunityError) {
    return toDatabaseError(existingCommunityError, ownerUserId, {
      communityId,
      operation: "get_delete_target_community",
    });
  }

  if (!existingCommunity) {
    logger.warn(DELETE_COMMUNITY_NOT_FOUND_MESSAGE, {
      category: "system",
      action: "community.delete",
      outcome: "failure",
      resource_type: "community",
      resource_id: communityId,
      communityId,
      user_id: ownerUserId,
      reason: "delete_target_not_found",
    });
    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: DELETE_COMMUNITY_NOT_FOUND_MESSAGE,
      })
    );
  }

  const adminClient = await createAuditedAdminClient(
    AdminReason.COMMUNITY_MANAGEMENT,
    `Soft delete community: ${communityId}`,
    {
      userId: ownerUserId,
      operationType: "UPDATE",
      accessedTables: ["public.communities"],
      additionalInfo: {
        operation: "soft_delete_community",
        communityId,
      },
    }
  );

  const { count, error } = await adminClient
    .from("communities")
    .update(
      {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", communityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false);

  if (error) {
    return toDatabaseError(error, ownerUserId, {
      communityId,
      operation: "soft_delete_community",
    });
  }

  if ((count ?? 0) === 0) {
    logger.warn(DELETE_COMMUNITY_NOT_FOUND_MESSAGE, {
      category: "system",
      action: "community.delete",
      outcome: "failure",
      resource_type: "community",
      resource_id: communityId,
      communityId,
      user_id: ownerUserId,
      reason: "delete_target_not_found",
    });
    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: DELETE_COMMUNITY_NOT_FOUND_MESSAGE,
      })
    );
  }

  logger.info("コミュニティを削除しました", {
    category: "system",
    action: "community.delete",
    outcome: "success",
    resource_type: "community",
    resource_id: communityId,
    communityId,
    user_id: ownerUserId,
  });

  return okResult({
    communityId,
  });
}
