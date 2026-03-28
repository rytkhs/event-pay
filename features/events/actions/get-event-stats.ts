import { getOwnedEventContextForCurrentCommunity } from "@core/community/get-owned-event-context-for-current-community";
import {
  type ActionResult,
  fail,
  ok,
  toActionResultFromAppResult,
} from "@core/errors/adapters/server-actions";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

type EventStats = {
  attending_count: number;
  maybe_count: number;
};

export async function getEventStatsAction(
  eventId: string,
  currentCommunityId: string
): Promise<ActionResult<EventStats>> {
  try {
    const supabase = await createServerComponentSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const accessResult = await getOwnedEventContextForCurrentCommunity(
      supabase,
      eventId,
      currentCommunityId
    );

    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", {
        userMessage: "イベント情報の取得に失敗しました",
      });
    }

    const { data: attendances, error } = await supabase
      .from("attendances")
      .select("status")
      .eq("event_id", accessContext.id);

    if (error) {
      return fail("DATABASE_ERROR", {
        userMessage: "統計の取得に失敗しました",
        retryable: true,
      });
    }

    const attending_count = (attendances || []).filter((a) => a.status === "attending").length;
    const maybe_count = (attendances || []).filter((a) => a.status === "maybe").length;

    return ok({ attending_count, maybe_count });
  } catch (_e) {
    return fail("INTERNAL_ERROR", { userMessage: "統計の取得に失敗しました", retryable: false });
  }
}
