"use server";

import { createClient } from "@/lib/supabase/server";
import { validateEventId } from "@/lib/validations/event-id";
import { checkDeleteRestrictions } from "@/lib/utils/event-restrictions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function deleteEventAction(eventId: string) {
  try {
    // イベントIDのバリデーション
    const validation = validateEventId(eventId);
    if (!validation.success) {
      return {
        success: false,
        error: { message: "Invalid event ID format" },
      };
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
      .eq("id", validation.data)
      .eq("created_by", user.id)
      .single();

    if (fetchError || !event) {
      return {
        success: false,
        error: { message: "Event not found" },
      };
    }

    // 削除制限チェック
    const restrictions = checkDeleteRestrictions(event);
    if (restrictions.length > 0) {
      return {
        success: false,
        error: {
          message: restrictions[0].message,
          violations: restrictions,
        },
      };
    }

    // イベント削除（RLSで自分のイベントのみ削除可能）
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", validation.data)
      .eq("created_by", user.id);

    if (error) {
      if (error.code === "PGRST116") {
        return {
          success: false,
          error: { message: "Event not found" },
        };
      }
      if (error.code === "23503") {
        return {
          success: false,
          error: { message: "Cannot delete event with existing participants" },
        };
      }
      return {
        success: false,
        error: { message: "Failed to delete event" },
      };
    }

    // キャッシュを無効化
    revalidatePath("/events");
    revalidatePath(`/events/${validation.data}`);

    return { success: true };
  } catch (_) {
    return {
      success: false,
      error: { message: "An unexpected error occurred" },
    };
  }
}
