/**
 * Core Invite Actions
 * Invite機能のServer Actions統合（境界違反解消）
 */

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
 * 招待トークン生成アクション（features/eventsから移動）
 * Invite→Events境界違反を解消するためのCore統合
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
    // バリデーション
    const validatedEventId = generateInviteTokenSchema.parse(eventId);

    // 認証確認
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "Authentication required",
      };
    }

    // セキュアなSupabaseクライアントを取得
    const factory = SecureSupabaseClientFactory.getInstance();
    const client = await factory.createAuthenticatedClient();

    // イベントの存在確認と所有者チェック
    const { data: event, error: eventError } = await client
      .from("events")
      .select("id, created_by")
      .eq("id", validatedEventId)
      .single();

    if (eventError || !event) {
      return {
        success: false,
        error: "Event not found",
      };
    }

    // 所有者チェック
    if (event.created_by !== user.id) {
      return {
        success: false,
        error: "Permission denied",
      };
    }

    // 既存トークンの確認
    if (!options.forceRegenerate) {
      const { data: existingToken } = await client
        .from("events")
        .select("invite_token")
        .eq("id", validatedEventId)
        .single();

      if (existingToken?.invite_token) {
        return {
          success: true,
          token: existingToken.invite_token,
        };
      }
    }

    // 新しいトークンを生成
    const newToken = generateInviteToken();

    // データベースに保存
    const { error: updateError } = await client
      .from("events")
      .update({ invite_token: newToken })
      .eq("id", validatedEventId);

    if (updateError) {
      return {
        success: false,
        error: "Failed to save invite token",
      };
    }

    return {
      success: true,
      token: newToken,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
