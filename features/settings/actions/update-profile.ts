"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import type { ActionResult } from "@core/actions/auth";
import { getCurrentUser } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import { handleServerError } from "@core/utils/error-handler.server";

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "表示名は必須です")
    .max(255, "表示名は255文字以内で入力してください")
    .trim(),
});

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  try {
    // 認証チェック
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 入力値検証
    const rawData = {
      name: formData.get("name") as string,
    };

    const validationResult = updateProfileSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join(", ");
      return {
        success: false,
        error: errors,
      };
    }

    const { name } = validationResult.data;

    // データベース更新
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      handleServerError(updateError, {
        category: "authentication",
        action: "update_profile",
        actorType: "user",
        userId: user.id,
      });
      return {
        success: false,
        error: "プロフィールの更新に失敗しました",
      };
    }

    // キャッシュ無効化
    revalidatePath("/settings/profile");
    revalidatePath("/dashboard");

    logger.info("Profile updated successfully", {
      category: "authentication",
      action: "update_profile",
      actor_type: "user",
      user_id: user.id,
      outcome: "success",
    });

    return {
      success: true,
      message: "プロフィールを更新しました",
    };
  } catch (error) {
    handleServerError("PROFILE_UPDATE_UNEXPECTED_ERROR", {
      category: "authentication",
      action: "update_profile",
      actorType: "user",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      success: false,
      error: "プロフィールの更新中にエラーが発生しました",
    };
  }
}
