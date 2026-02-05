import { redirect } from "next/navigation";

import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import type { EventDetail as DetailType } from "@core/types/models";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { validateEventId } from "@core/validation/event-id";

export async function getEventDetailAction(eventId: string): Promise<ActionResult<DetailType>> {
  try {
    // イベントIDのバリデーション
    const validation = validateEventId(eventId);
    if (!validation.success) {
      return fail("EVENT_INVALID_ID", { userMessage: "無効なイベントID形式です" });
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
        description,
        registration_deadline,
        payment_deadline,
        payment_methods,
        created_at,
        updated_at,
        created_by,
        invite_token,
        canceled_at
      `
      )
      .eq("id", validation.data as string)
      .eq("created_by", user.id)
      .maybeSingle<DetailType>();

    if (error) {
      if (error.code === "PGRST301") {
        return fail("EVENT_ACCESS_DENIED", {
          userMessage: "このイベントへのアクセス権限がありません",
        });
      }
      return fail("DATABASE_ERROR", { userMessage: "データベースエラーが発生しました" });
    }

    if (!eventDetail) {
      return fail("EVENT_NOT_FOUND", { userMessage: "イベントが見つかりません" });
    }

    // セキュリティ強化：get_event_creator_name()関数を使用してcreator_nameを取得
    const { data: creatorName, error: creatorError } = await supabase.rpc(
      "get_event_creator_name",
      { p_creator_id: eventDetail.created_by }
    );

    if (creatorError) {
      // Creator name fetch error - continue with fallback
      // ログのみ（UXを阻害しない）
      logger.warn("Failed to fetch creator name", {
        category: "event_management",
        action: "get_event_detail",
        actor_type: "user",
        event_id: eventDetail.id,
        creator_id: eventDetail.created_by,
        error_name: creatorError.code,
        error_message: creatorError.message,
        outcome: "failure",
      });
    }

    const computedStatus = deriveEventStatus(
      eventDetail.date,
      (eventDetail as any).canceled_at ?? null
    );

    const result: DetailType = {
      ...eventDetail,
      // 型の都合上、statusは算出値を設定（DBカラムではない）
      status: computedStatus as any,
      creator_name: creatorName || "Unknown User",
    };

    return ok(result);
  } catch (_error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
      retryable: true,
    });
  }
}
