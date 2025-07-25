"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/auth-utils";
import { generateInviteToken } from "@/lib/utils/invite-token";

const generateInviteTokenSchema = z.string().uuid("Invalid event ID format");

interface GenerateInviteTokenOptions {
  forceRegenerate?: boolean;
}

export async function generateInviteTokenAction(
  eventId: string,
  options: GenerateInviteTokenOptions = {}
) {
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

    // テスト環境ではservice_roleクライアントを使用
    const supabase =
      process.env.NODE_ENV === "test"
        ? createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )
        : createClient();

    // イベントの存在確認と権限チェック
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, created_by, invite_token")
      .eq("id", validatedEventId)
      .single();

    if (eventError || !event) {
      return {
        success: false,
        error: "Event not found",
      };
    }

    if (event.created_by !== user.id) {
      return {
        success: false,
        error: "Permission denied",
      };
    }

    // 既に招待トークンがある場合の処理
    if (event.invite_token && options.forceRegenerate !== true) {
      // forceRegenerate=trueでない場合は既存トークンを返す
      return {
        success: true,
        data: {
          inviteToken: event.invite_token,
          inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${event.invite_token}`,
        },
      };
    }

    // 新しい招待トークンを生成（重複チェック付き）
    let newInviteToken = generateInviteToken();
    let attempts = 0;
    const maxAttempts = 3;

    // 重複チェック（まれなケースだが安全性のため）
    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("invite_token", newInviteToken)
        .single();

      if (!existing) break;

      newInviteToken = generateInviteToken();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return {
        success: false,
        error: "Failed to generate unique invite token",
      };
    }

    // データベースを更新
    const { error: updateError } = await supabase
      .from("events")
      .update({ invite_token: newInviteToken })
      .eq("id", validatedEventId);

    if (updateError) {
      return {
        success: false,
        error: "Failed to update invite token",
      };
    }

    return {
      success: true,
      data: {
        inviteToken: newInviteToken,
        inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${newInviteToken}`,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid event ID",
      };
    }

    return {
      success: false,
      error: "Internal server error",
    };
  }
}
