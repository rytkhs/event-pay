"use server";

import { revalidatePath } from "next/cache";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { logEventManagement } from "@core/logging/system-logger";
import { createClient } from "@core/supabase/server";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";

export async function deleteEventAction(eventId: string): Promise<ServerActionResult<void>> {
  try {
    // 認証・権限（作成者のみ）+ イベントID検証
    const { eventId: validatedEventId, user } = await verifyEventAccess(eventId);

    const supabase = createClient();

    // 参加者カウント（attending / maybe のみを対象）
    const { count: participantCount, error: attendanceCountError } = await supabase
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", validatedEventId)
      .in("status", ["attending", "maybe"]);

    if (attendanceCountError) {
      return createServerActionError("DATABASE_ERROR", "参加者情報の取得に失敗しました");
    }

    // 支払いレコードの存在チェック（当該イベントの参加者に紐づく決済）
    const { count: paymentCount, error: paymentCountError } = await supabase
      .from("payments")
      .select("id, attendances!inner(event_id)", { count: "exact", head: true })
      .eq("attendances.event_id", validatedEventId);

    if (paymentCountError) {
      return createServerActionError("DATABASE_ERROR", "決済情報の取得に失敗しました");
    }

    const attendingOrMaybeCount = participantCount ?? 0;
    const hasPayments = (paymentCount ?? 0) > 0;

    // ケースAのみ許可（参加表明者が0件 かつ 支払いレコードが0件の場合）
    if (attendingOrMaybeCount > 0 || hasPayments) {
      return createServerActionError(
        "EVENT_DELETE_RESTRICTED",
        `参加表明者が${attendingOrMaybeCount}名、または支払いレコードが存在するため、このイベントは削除できません。イベントを中止してください。`,
        { details: { attendingOrMaybeCount, paymentCount: paymentCount ?? 0 } }
      );
    }

    // イベント削除（RLSで自分のイベントのみ削除可能）
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", validatedEventId)
      .eq("created_by", user.id);

    if (error) {
      if ((error as any).code === "23503") {
        return createServerActionError(
          "EVENT_DELETE_RESTRICTED",
          "関連データが存在するためイベントを削除できません"
        );
      }
      return createServerActionError("EVENT_DELETE_FAILED", "イベントの削除に失敗しました");
    }

    // 監査ログ記録
    await logEventManagement({
      action: "event.delete",
      message: `Event deleted: ${validatedEventId}`,
      user_id: user.id,
      resource_id: validatedEventId,
      outcome: "success",
    });

    // キャッシュを無効化
    revalidatePath("/events");
    revalidatePath(`/events/${validatedEventId}`);

    return createServerActionSuccess(undefined, "イベントが正常に削除されました");
  } catch (_error) {
    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      retryable: true,
    });
  }
}
