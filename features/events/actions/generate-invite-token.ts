"use server";

import { z } from "zod";

import { getCurrentUser } from "@core/auth/auth-utils";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { generateInviteToken } from "@core/utils/invite-token";

const generateInviteTokenSchema = z.string().uuid("Invalid event ID format");

interface GenerateInviteTokenOptions {
  forceRegenerate?: boolean;
}

/**
 * 招待トークン生成アクション（Eventの属性として管理）
 */
export async function generateInviteTokenAction(
  eventId: string,
  options: GenerateInviteTokenOptions = {}
): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  try {
    const validatedEventId = generateInviteTokenSchema.parse(eventId);

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const factory = SecureSupabaseClientFactory.create();
    const client = await factory.createAuthenticatedClient();

    const { data: event, error: eventError } = await client
      .from("events")
      .select("id, created_by")
      .eq("id", validatedEventId)
      .single();

    if (eventError || !event) {
      return { success: false, error: "Event not found" };
    }

    if (event.created_by !== user.id) {
      return { success: false, error: "Permission denied" };
    }

    if (!options.forceRegenerate) {
      const { data: existingToken } = await client
        .from("events")
        .select("invite_token")
        .eq("id", validatedEventId)
        .single();

      if (existingToken?.invite_token) {
        return { success: true, token: existingToken.invite_token };
      }
    }

    const newToken = generateInviteToken();

    const { error: updateError } = await client
      .from("events")
      .update({ invite_token: newToken })
      .eq("id", validatedEventId);

    if (updateError) {
      return { success: false, error: "Failed to save invite token" };
    }

    return { success: true, token: newToken };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
