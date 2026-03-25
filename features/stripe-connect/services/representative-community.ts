import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { getPublicUrl } from "@core/seo/metadata";
import type { AppSupabaseClient } from "@core/types/supabase";

type RepresentativeCommunityRow = {
  id: string;
  name: string;
  slug: string;
};

export type RepresentativeCommunitySelection = {
  id: string;
  name: string;
  slug: string;
  publicPageUrl: string;
};

const REPRESENTATIVE_COMMUNITY_INVALID_MESSAGE =
  "代表公開ページに使うコミュニティは、自分の未削除コミュニティから選択してください";
const REPRESENTATIVE_COMMUNITY_LOOKUP_ERROR_MESSAGE = "代表公開ページの確認に失敗しました";
const PAYOUT_PROFILE_UPDATE_ERROR_MESSAGE = "代表公開ページの保存に失敗しました";
const PAYOUT_PROFILE_NOT_FOUND_MESSAGE = "Stripe の受取設定が見つかりません";

function invalidRepresentativeCommunityResult(): AppResult<never> {
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
    .select("id, name, slug")
    .eq("id", representativeCommunityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .maybeSingle<RepresentativeCommunityRow>();

  if (error) {
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
    return invalidRepresentativeCommunityResult();
  }

  return okResult({
    id: data.id,
    name: data.name,
    slug: data.slug,
    publicPageUrl: getPublicUrl(`/c/${data.slug}`),
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
    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: PAYOUT_PROFILE_NOT_FOUND_MESSAGE,
      })
    );
  }

  return okResult(undefined);
}
