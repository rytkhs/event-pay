import { verifyEventAccess, handleDatabaseError } from "@core/auth/event-authorization";
import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import { createClient } from "@core/supabase/server";

type EventStats = {
  attending_count: number;
  maybe_count: number;
};

export async function getEventStatsAction(eventId: string): Promise<ActionResult<EventStats>> {
  try {
    const { eventId: validatedEventId } = await verifyEventAccess(eventId);

    const supabase = createClient();

    const { data: attendances, error } = await supabase
      .from("attendances")
      .select("status")
      .eq("event_id", validatedEventId);

    if (error) {
      handleDatabaseError(error, { eventId: validatedEventId, userId: "unknown" });
    }

    const attending_count = (attendances || []).filter((a) => a.status === "attending").length;
    const maybe_count = (attendances || []).filter((a) => a.status === "maybe").length;

    return ok({ attending_count, maybe_count });
  } catch (e) {
    return fail("INTERNAL_ERROR", { userMessage: "統計の取得に失敗しました", retryable: false });
  }
}
