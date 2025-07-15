"use server";

import { createClient } from "@/lib/supabase/server";
import { validateEventId } from "@/lib/validations/event-id";
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
      redirect("/auth/login");
    }

    // イベント削除（RLSで自分のイベントのみ削除可能）
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", validation.data)
      .eq("created_by", user.id);

    if (error) {
      console.error("Delete event error:", {
        code: error.code,
        message: error.message,
        eventId: validation.data,
        userId: user.id,
      });

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
  } catch (error) {
    console.error("Unexpected error in deleteEventAction:", error);
    return {
      success: false,
      error: { message: "An unexpected error occurred" },
    };
  }
}
