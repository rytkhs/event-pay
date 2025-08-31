"use server";

import { createClient } from "@core/supabase/server";
import { validateEventId } from "@core/validation/event-id";
import { redirect } from "next/navigation";
import { logger } from "@core/logging/app-logger";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult
} from "@core/types/server-actions";

import type { EventDetail as DetailType } from "@/types/models";

export async function getEventDetailAction(eventId: string): Promise<ServerActionResult<DetailType>> {
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
        invite_token
      `
      )
      .eq("id", validation.data as string)
      .eq("created_by", user.id)
      .maybeSingle<DetailType>();

    if (error) {
      if (error.code === "PGRST301") {
        return createServerActionError("EVENT_ACCESS_DENIED", "このイベントへのアクセス権限がありません");
      }
      return createServerActionError("DATABASE_ERROR", "データベースエラーが発生しました");
    }

    if (!eventDetail) {
      return createServerActionError("EVENT_NOT_FOUND", "イベントが見つかりません");
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
        tag: "getEventDetail",
        event_id: eventDetail.id,
        creator_id: eventDetail.created_by,
        error_name: creatorError.code,
        error_message: creatorError.message
      });
    }

    const result: DetailType = {
      ...eventDetail,
      creator_name: creatorName || "Unknown User",
    };

    return createServerActionSuccess(result);
  } catch (_error) {
    return createServerActionError(
      "INTERNAL_ERROR",
      "予期しないエラーが発生しました",
      { retryable: true }
    );
  }
}
