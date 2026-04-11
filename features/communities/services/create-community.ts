import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import { hasPostgrestCode } from "@core/supabase/postgrest-error-guards";
import type { CommunityInsert } from "@core/types/community";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { CreateCommunityInput } from "../validation";

const CREATE_COMMUNITY_ERROR_MESSAGE = "コミュニティの作成に失敗しました";
const DEFAULT_MAX_INSERT_ATTEMPTS = 5;

export type CreateCommunityResult = {
  communityId: string;
};

type CreateCommunityOptions = {
  maxInsertAttempts?: number;
};

type PayoutProfileLookupRow = {
  id: string;
};

function toDatabaseError(
  cause: unknown,
  ownerUserId: string,
  details?: Record<string, string | number | boolean | null>
) {
  logger.error("Community create failed", {
    category: "system",
    action: "community.create",
    outcome: "failure",
    user_id: ownerUserId,
    error: cause,
    ...details,
  });

  return errResult(
    new AppError("DATABASE_ERROR", {
      cause,
      details,
      retryable: true,
      userMessage: CREATE_COMMUNITY_ERROR_MESSAGE,
    })
  );
}

async function resolveOwnerPayoutProfileId(
  supabase: AppSupabaseClient,
  ownerUserId: string
): Promise<AppResult<string | null>> {
  const { data, error } = await supabase
    .from("payout_profiles")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle<PayoutProfileLookupRow>();

  if (error) {
    return toDatabaseError(error, ownerUserId, {
      operation: "select_owner_payout_profile",
    });
  }

  return okResult(data?.id ?? null);
}

export async function createCommunity(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  input: CreateCommunityInput,
  options: CreateCommunityOptions = {}
): Promise<AppResult<CreateCommunityResult>> {
  const payoutProfileResult = await resolveOwnerPayoutProfileId(supabase, ownerUserId);

  if (!payoutProfileResult.success) {
    return payoutProfileResult;
  }

  const maxInsertAttempts = Math.max(1, options.maxInsertAttempts ?? DEFAULT_MAX_INSERT_ATTEMPTS);

  for (let attempt = 1; attempt <= maxInsertAttempts; attempt += 1) {
    const insertPayload: CommunityInsert = {
      created_by: ownerUserId,
      current_payout_profile_id: payoutProfileResult.data ?? null,
      description: input.description,
      name: input.name,
    };

    const { data, error } = await supabase
      .from("communities")
      .insert(insertPayload)
      .select("id")
      .single<{ id: string }>();

    if (!error && data) {
      logger.info("Community created", {
        category: "system",
        action: "community.create",
        outcome: "success",
        resource_type: "community",
        resource_id: data.id,
        user_id: ownerUserId,
        communityId: data.id,
      });

      return okResult({
        communityId: data.id,
      });
    }

    if (error && hasPostgrestCode(error, "23505") && attempt < maxInsertAttempts) {
      continue;
    }

    return toDatabaseError(error ?? new Error("Community insert returned no row"), ownerUserId, {
      attempt,
      operation: "insert_community",
      slugConflict: error ? hasPostgrestCode(error, "23505") : false,
    });
  }

  return toDatabaseError(new Error("Community insert retries exhausted"), ownerUserId, {
    operation: "insert_community",
    slugConflict: true,
  });
}
