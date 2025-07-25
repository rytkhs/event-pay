"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyEventAccess, handleDatabaseError } from "@/lib/auth/event-authorization";

export async function getEventAttendancesAction(eventId: string) {
  try {
    // 共通の認証・権限確認処理
    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    const supabase = createClient();

    // 参加者データ取得（RLSで自分のイベントのみ取得可能）
    const { data: attendances, error } = await supabase
      .from("attendances")
      .select(
        `
        id,
        status
      `
      )
      .eq("event_id", validatedEventId);

    if (error) {
      handleDatabaseError(error, { eventId: validatedEventId, userId: user.id });
    }

    return attendances || [];
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error");
  }
}
