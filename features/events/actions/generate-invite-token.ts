import { verifyEventAccess } from "@core/auth/event-authorization";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { generateInviteToken } from "@core/utils/invite-token";

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

    await verifyEventAccess(validatedEventId);

    const client = await createServerActionSupabaseClient();

    const { data: event, error: eventError } = await client
      .from("events")
      .select("id")
      .eq("id", validatedEventId)
      .single();

    if (eventError || !event) {
      return fail("NOT_FOUND", { userMessage: "Event not found" });
    }

    if (!options.forceRegenerate) {
      const { data: existingToken } = await client
        .from("events")
        .select("invite_token")
        .eq("id", validatedEventId)
        .single();

      if (existingToken?.invite_token) {
        return ok({ token: existingToken.invite_token });
      }
    }

    const newToken = generateInviteToken();

    const { error: updateError } = await client
      .from("events")
      .update({ invite_token: newToken })
      .eq("id", validatedEventId);

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
