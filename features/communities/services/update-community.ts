import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { UpdateCommunityInput } from "../validation";

const UPDATE_COMMUNITY_ERROR_MESSAGE = "コミュニティの更新に失敗しました";
const COMMUNITY_NOT_FOUND_MESSAGE = "更新対象のコミュニティが見つかりません";

type UpdatedCommunityRow = {
  description: string | null;
  id: string;
  name: string;
};

export type UpdateCommunityResult = {
  communityId: string;
  description: string | null;
  name: string;
};

function toDatabaseError(cause: unknown) {
  return errResult(
    new AppError("DATABASE_ERROR", {
      cause,
      retryable: true,
      userMessage: UPDATE_COMMUNITY_ERROR_MESSAGE,
    })
  );
}

export async function updateCommunity(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  communityId: string,
  input: UpdateCommunityInput
): Promise<AppResult<UpdateCommunityResult>> {
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
    .maybeSingle<UpdatedCommunityRow>();

  if (error) {
    return toDatabaseError(error);
  }

  if (!data) {
    return errResult(
      new AppError("NOT_FOUND", {
        retryable: false,
        userMessage: COMMUNITY_NOT_FOUND_MESSAGE,
      })
    );
  }

  return okResult({
    communityId: data.id,
    description: data.description,
    name: data.name,
  });
}
