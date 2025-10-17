"use server";

import { verifyEventAccess, handleDatabaseError } from "@core/auth/event-authorization";
import { createClient } from "@core/supabase/server";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";

type EventStats = {
  attending_count: number;
  maybe_count: number;
};

export async function getEventStatsAction(
  eventId: string
): Promise<ServerActionResult<EventStats>> {
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

    return createServerActionSuccess({ attending_count, maybe_count });
  } catch (e) {
    return createServerActionError("INTERNAL_ERROR", "統計の取得に失敗しました", {
      retryable: false,
    });
  }
}
