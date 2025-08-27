"use server";

import { createClient } from "@/lib/supabase/server";
import { validateEventId } from "@/lib/validations/event-id";
import { checkDeleteRestrictions } from "@/lib/utils/event-restrictions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult
} from "@/lib/types/server-actions";

export async function deleteEventAction(eventId: string): Promise<ServerActionResult<void>> {
  try {
    // イベントIDのバリデーション
    const validation = validateEventId(eventId);
    if (!validation.success) {
      return createServerActionError("EVENT_INVALID_ID", "無効なイベントID形式です");
    }

    const supabase = createClient();

    // 認証確認
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect("/login");
    }

    // イベント情報を取得（削除制限チェック用）
    const { data: event, error: fetchError } = await supabase
      .from("events")
      .select(
        `
        *,
        attendances(id, status)
      `
      )
      .eq("id", validation.data as any)
      .eq("created_by", user.id)
      .maybeSingle();

    if (fetchError || !event) {
      return createServerActionError("EVENT_NOT_FOUND", "イベントが見つかりません");
    }

    // 削除制限チェック
    const restrictions = checkDeleteRestrictions(event as any);
    if (restrictions.length > 0) {
      return createServerActionError(
        "EVENT_DELETE_RESTRICTED",
        restrictions[0].message,
        { details: { violations: restrictions } }
      );
    }

    // イベント削除（RLSで自分のイベントのみ削除可能）
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", validation.data as any)
      .eq("created_by", user.id);

    if (error) {
      if (error.code === "23503") {
        return createServerActionError(
          "EVENT_DELETE_RESTRICTED",
          "参加者が存在するためイベントを削除できません"
        );
      }
      return createServerActionError("EVENT_DELETE_FAILED", "イベントの削除に失敗しました");
    }

    // キャッシュを無効化
    revalidatePath("/events");
    revalidatePath(`/events/${validation.data}`);

    return createServerActionSuccess(undefined, "イベントが正常に削除されました");
  } catch (error) {
    return createServerActionError(
      "INTERNAL_ERROR",
      "予期しないエラーが発生しました",
      { retryable: true }
    );
  }
}
