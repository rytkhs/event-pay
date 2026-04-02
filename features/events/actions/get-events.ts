import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { resolveCurrentCommunityForServerAction } from "@core/community/current-community";
import {
  toActionResultFromAppResult,
  type ActionResult,
  fail,
} from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import {
  listEventsForCommunity,
  type GetEventsData,
  type GetEventsOptions,
} from "../services/list-events";

export type { GetEventsData, GetEventsOptions } from "../services/list-events";

function emptyEventsResult(): GetEventsData {
  return {
    items: [],
    totalCount: 0,
    hasMore: false,
  };
}

export async function getEventsAction(
  options: GetEventsOptions = {}
): Promise<ActionResult<GetEventsData>> {
  try {
    const user = await getCurrentUserForServerAction();

    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const currentCommunityResolutionResult = await resolveCurrentCommunityForServerAction();

    if (!currentCommunityResolutionResult.success) {
      return toActionResultFromAppResult(currentCommunityResolutionResult, {
        userMessage: "イベント一覧の取得に失敗しました",
      });
    }

    if (!currentCommunityResolutionResult.data) {
      return fail("INTERNAL_ERROR", { userMessage: "イベント一覧の取得に失敗しました" });
    }

    const currentCommunityResolution = currentCommunityResolutionResult.data;

    if (!currentCommunityResolution.currentCommunity) {
      return toActionResultFromAppResult({
        success: true,
        data: emptyEventsResult(),
      });
    }

    const supabase = await createServerActionSupabaseClient();
    const result = await listEventsForCommunity(
      supabase,
      currentCommunityResolution.currentCommunity.id,
      options
    );

    return toActionResultFromAppResult(result);
  } catch (error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "イベント一覧の取得に失敗しました",
      retryable: true,
      details: {
        originalError: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
