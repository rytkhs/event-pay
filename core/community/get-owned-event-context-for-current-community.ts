import "server-only";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { EventRow } from "@core/types/event";
import type { AppSupabaseClient } from "@core/types/supabase";
import { validateEventId } from "@core/validation/event-id";

type OwnedEventContextRow = Pick<EventRow, "id" | "community_id" | "created_by">;

export type OwnedEventContext = {
  id: string;
  communityId: string;
  createdBy: string;
};

export async function getOwnedEventContextForCurrentCommunity(
  supabase: AppSupabaseClient,
  eventId: string,
  currentCommunityId: string
): Promise<AppResult<OwnedEventContext>> {
  const validation = validateEventId(eventId);
  if (!validation.success || !validation.data) {
    return errResult(
      new AppError("EVENT_INVALID_ID", {
        userMessage: "無効なイベントID形式です",
        details: { eventId },
      })
    );
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id, community_id, created_by")
    .eq("id", validation.data)
    .maybeSingle<OwnedEventContextRow>();

  if (error) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        userMessage: "イベント情報の取得に失敗しました",
        details: {
          operation: "get_owned_event_context_for_current_community",
          eventId: validation.data,
          currentCommunityId,
        },
        retryable: true,
      })
    );
  }

  if (!event) {
    return errResult(
      new AppError("EVENT_NOT_FOUND", {
        userMessage: "イベントが見つかりません",
        details: { eventId: validation.data },
      })
    );
  }

  if (!event.community_id) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        message: "Event community_id is missing.",
        userMessage: "イベント情報の取得に失敗しました",
        details: {
          operation: "get_owned_event_context_for_current_community",
          eventId: validation.data,
          currentCommunityId,
        },
      })
    );
  }

  if (event.community_id !== currentCommunityId) {
    return errResult(
      new AppError("EVENT_ACCESS_DENIED", {
        userMessage: "現在選択中のコミュニティではこのイベントを表示できません",
        details: {
          eventId: validation.data,
          currentCommunityId,
          eventCommunityId: event.community_id,
        },
      })
    );
  }

  return okResult({
    id: event.id,
    communityId: event.community_id,
    createdBy: event.created_by,
  });
}
