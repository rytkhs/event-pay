"use server";

import { createClient } from "@/lib/supabase/server";
import { validateEventId } from "@/lib/validations/event-id";
import { redirect } from "next/navigation";

export async function getEventDetailAction(eventId: string) {
  try {
    // イベントIDのバリデーション
    const validation = validateEventId(eventId);
    if (!validation.success) {
      throw new Error("Invalid event ID format");
    }

    const supabase = createClient();

    // 認証確認
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      redirect("/login");
      return; // redirect後の処理を防ぐため早期return
    }

    // イベント詳細取得（RLSで自分のイベントのみ取得可能）
    const { data: eventDetail, error } = await supabase
      .from("events")
      .select(
        `
        id,
        title,
        date,
        location,
        fee,
        capacity,
        status,
        description,
        registration_deadline,
        payment_deadline,
        payment_methods,
        created_at,
        updated_at,
        created_by,
        invite_token,
        organizer_id:created_by
      `
      )
      .eq("id", validation.data)
      .eq("created_by", user.id)
      .single();

    if (error) {
      console.error("Database error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        eventId: validation.data,
        userId: user.id,
      });

      if (error.code === "PGRST116") {
        throw new Error("Event not found");
      }
      if (error.code === "PGRST301") {
        throw new Error("Access denied");
      }
      throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
    }

    if (!eventDetail) {
      throw new Error("Event not found");
    }

    // セキュリティ強化：get_event_creator_name()関数を使用してcreator_nameを取得
    const { data: creatorName, error: creatorError } = await supabase.rpc(
      "get_event_creator_name",
      { event_id: validation.data }
    );

    if (creatorError) {
      console.error("Creator name fetch error:", creatorError);
    }

    const result = {
      ...eventDetail,
      creator_name: creatorName || "Unknown User",
    };

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error");
  }
}
