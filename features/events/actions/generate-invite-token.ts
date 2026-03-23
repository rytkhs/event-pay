import {
  fail,
  ok,
  toActionResultFromAppResult,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { generateInviteToken } from "@core/utils/invite-token";

import { getOwnedEventActionContextForServerAction } from "../services/get-owned-event-context-for-community";
import { generateInviteTokenEventIdSchema } from "../validation";

interface GenerateInviteTokenOptions {
  forceRegenerate?: boolean;
}

/**
 * 招待トークン生成アクション（Eventの属性として管理）
 */
export async function generateInviteTokenAction(
  eventId: string,
  options: GenerateInviteTokenOptions = {}
): Promise<ActionResult<{ token: string }>> {
  try {
    const validatedEventId = generateInviteTokenEventIdSchema.parse(eventId);

    const client = await createServerActionSupabaseClient();
    const accessResult = await getOwnedEventActionContextForServerAction(client, validatedEventId);
    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", { userMessage: "イベント情報の取得に失敗しました" });
    }

    const { data: event, error: eventError } = await client
      .from("events")
      .select("id")
      .eq("id", accessContext.id)
      .single();

    if (eventError || !event) {
      return fail("NOT_FOUND", { userMessage: "Event not found" });
    }

    if (!options.forceRegenerate) {
      const { data: existingToken } = await client
        .from("events")
        .select("invite_token")
        .eq("id", accessContext.id)
        .single();

      if (existingToken?.invite_token) {
        return ok({ token: existingToken.invite_token });
      }
    }

    const newToken = generateInviteToken();

    const { error: updateError } = await client
      .from("events")
      .update({ invite_token: newToken })
      .eq("id", accessContext.id);

    if (updateError) {
      return fail("DATABASE_ERROR", { userMessage: "Failed to save invite token" });
    }

    return ok({ token: newToken });
  } catch (error) {
    return fail("INTERNAL_ERROR", {
      userMessage: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
