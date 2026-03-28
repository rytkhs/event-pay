import "server-only";

import type { User } from "@supabase/supabase-js";

import { getCurrentCommunityServerActionContext } from "@core/community/current-community";
import {
  getOwnedEventContextForCurrentCommunity,
  type OwnedEventContext,
} from "@core/community/get-owned-event-context-for-current-community";
import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { AppSupabaseClient } from "@core/types/supabase";

export type OwnedEventActionContext = OwnedEventContext & {
  currentCommunityId: string;
  user: User;
};

export async function getOwnedEventActionContextForServerAction(
  supabase: AppSupabaseClient,
  eventId: string
): Promise<AppResult<OwnedEventActionContext>> {
  const currentCommunityContext = await getCurrentCommunityServerActionContext();
  if (!currentCommunityContext.success) {
    return currentCommunityContext;
  }

  const currentCommunityContextData = currentCommunityContext.data;
  if (!currentCommunityContextData) {
    return errResult(
      new AppError("INTERNAL_ERROR", {
        message: "Current community server action context returned no data.",
        userMessage: "コミュニティ情報の取得に失敗しました",
      })
    );
  }

  const eventContext = await getOwnedEventContextForCurrentCommunity(
    supabase,
    eventId,
    currentCommunityContextData.currentCommunity.id
  );

  if (!eventContext.success) {
    return eventContext;
  }

  const eventContextData = eventContext.data;
  if (!eventContextData) {
    return errResult(
      new AppError("INTERNAL_ERROR", {
        message: "Owned event context returned no data.",
        userMessage: "イベント情報の取得に失敗しました",
      })
    );
  }

  return okResult({
    ...eventContextData,
    currentCommunityId: currentCommunityContextData.currentCommunity.id,
    user: currentCommunityContextData.user,
  });
}
