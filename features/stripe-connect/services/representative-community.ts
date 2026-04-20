import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import { getPublicUrl } from "@core/seo/metadata";
import type { AppSupabaseClient } from "@core/types/supabase";

type RepresentativeCommunityRow = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

export type RepresentativeCommunitySelection = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
  publicPageUrl: string;
};

const REPRESENTATIVE_COMMUNITY_INVALID_MESSAGE =
  "代表コミュニティは、自分の未削除コミュニティから選択してください";
const REPRESENTATIVE_COMMUNITY_LOOKUP_ERROR_MESSAGE = "代表コミュニティの確認に失敗しました";
const PAYOUT_PROFILE_UPDATE_ERROR_MESSAGE = "代表コミュニティの保存に失敗しました";
const PAYOUT_PROFILE_NOT_FOUND_MESSAGE = "Stripe の受取設定が見つかりません";
const REPRESENTATIVE_COMMUNITY_DESCRIPTION_UPDATE_ERROR_MESSAGE =
  "コミュニティ説明の保存に失敗しました";

function invalidRepresentativeCommunityResult(
  ownerUserId: string,
  representativeCommunityId: string
): AppResult<never> {
  logger.warn("Representative community selection is not allowed", {
    category: "authorization",
    action: "stripe_connect.representative_community.resolve",
    outcome: "failure",
    resource_type: "community",
    resource_id: representativeCommunityId,
    user_id: ownerUserId,
    requestedCommunityId: representativeCommunityId,
  });

  return errResult(
    new AppError("VALIDATION_ERROR", {
      details: {
        representativeCommunityId: REPRESENTATIVE_COMMUNITY_INVALID_MESSAGE,
      },
      retryable: false,
      userMessage: REPRESENTATIVE_COMMUNITY_INVALID_MESSAGE,
    })
  );
}

export async function resolveRepresentativeCommunitySelection(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  representativeCommunityId: string
): Promise<AppResult<RepresentativeCommunitySelection>> {
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, slug, description")
    .eq("id", representativeCommunityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .maybeSingle<RepresentativeCommunityRow>();

  if (error) {
    logger.error("Representative community lookup failed", {
      category: "stripe_connect",
      action: "stripe_connect.representative_community.resolve",
      outcome: "failure",
      resource_type: "community",
      resource_id: representativeCommunityId,
      user_id: ownerUserId,
      requestedCommunityId: representativeCommunityId,
      error,
    });

    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        details: {
          operation: "resolve_representative_community_selection",
          ownerUserId,
          representativeCommunityId,
        },
        retryable: true,
        userMessage: REPRESENTATIVE_COMMUNITY_LOOKUP_ERROR_MESSAGE,
      })
    );
  }

  if (!data) {
    return invalidRepresentativeCommunityResult(ownerUserId, representativeCommunityId);
  }

  return okResult({
    description: data.description,
    id: data.id,
    name: data.name,
    slug: data.slug,
    publicPageUrl: getPublicUrl(`/c/${data.slug}`),
  });
}

export async function updateRepresentativeCommunityDescription(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  representativeCommunityId: string,
  description: string
): Promise<AppResult<{ description: string | null; id: string }>> {
  const { data, error } = await supabase
    .from("communities")
    .update({
      description,
    })
    .eq("id", representativeCommunityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .select("id, description")
    .maybeSingle<{ description: string | null; id: string }>();

  if (error) {
    logger.error("Representative community description update failed", {
      category: "stripe_connect",
      action: "stripe_connect.representative_community.description.update",
      outcome: "failure",
      resource_type: "community",
      resource_id: representativeCommunityId,
      user_id: ownerUserId,
      communityId: representativeCommunityId,
      error,
    });

    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        details: {
          operation: "update_representative_community_description",
          ownerUserId,
          representativeCommunityId,
        },
        retryable: true,
        userMessage: REPRESENTATIVE_COMMUNITY_DESCRIPTION_UPDATE_ERROR_MESSAGE,
      })
    );
  }

  if (!data) {
    return invalidRepresentativeCommunityResult(ownerUserId, representativeCommunityId);
  }

  logger.info("Representative community description updated", {
    category: "stripe_connect",
    action: "stripe_connect.representative_community.description.update",
    outcome: "success",
    resource_type: "community",
    resource_id: data.id,
    user_id: ownerUserId,
    communityId: data.id,
  });

  return okResult({
    description: data.description,
    id: data.id,
  });
}

export async function updateRepresentativeCommunitySelection(
  supabase: AppSupabaseClient,
  payoutProfileId: string,
  representativeCommunityId: string
): Promise<AppResult<void>> {
  const { data, error } = await supabase
    .from("payout_profiles")
    .update({
      representative_community_id: representativeCommunityId,
    })
    .eq("id", payoutProfileId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    logger.error("Representative community update failed", {
      category: "stripe_connect",
      action: "stripe_connect.representative_community.persist",
      outcome: "failure",
      resource_type: "community",
      resource_id: representativeCommunityId,
      payoutProfileId,
      communityId: representativeCommunityId,
      error,
    });

    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        details: {
          operation: "update_representative_community_selection",
          payoutProfileId,
          representativeCommunityId,
        },
        retryable: true,
        userMessage: PAYOUT_PROFILE_UPDATE_ERROR_MESSAGE,
      })
    );
  }

  if (!data?.id) {
    logger.warn("Representative community update target not found", {
      category: "stripe_connect",
      action: "stripe_connect.representative_community.persist",
      outcome: "failure",
      resource_type: "community",
      resource_id: representativeCommunityId,
      payoutProfileId,
      communityId: representativeCommunityId,
    });

    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: PAYOUT_PROFILE_NOT_FOUND_MESSAGE,
      })
    );
  }

  return okResult(undefined);
}
