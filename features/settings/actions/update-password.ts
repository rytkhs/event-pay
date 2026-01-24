import { z } from "zod";

import { getCurrentUser } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import { handleServerError } from "@core/utils/error-handler.server";

import type { ActionResult } from "@/types/action-result";

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
  newPassword: z
    .string()
    .min(8, "パスワードは8文字以上で入力してください")
    .max(128, "パスワードは128文字以内で入力してください"),
});

export async function updatePasswordAction(formData: FormData): Promise<ActionResult> {
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
      currentPassword: formData.get("currentPassword") as string,
      newPassword: formData.get("newPassword") as string,
    };

    const validationResult = updatePasswordSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join(", ");
      return {
        success: false,
        error: errors,
      };
    }

    const { currentPassword, newPassword } = validationResult.data;

    // 現在のパスワードで再認証
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email || "",
      password: currentPassword,
    });

    if (signInError) {
      logger.warn("Password reauthentication failed", {
        category: "authentication",
        action: "update_password",
        actor_type: "user",
        user_id: user.id,
        error_message: signInError.message,
        outcome: "failure",
      });
      return {
        success: false,
        error: "現在のパスワードが正しくありません",
      };
    }

    // パスワード更新
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      handleServerError(updateError, {
        category: "authentication",
        action: "update_password",
        actorType: "user",
        userId: user.id,
      });
      return {
        success: false,
        error: "パスワードの更新に失敗しました",
      };
    }

    logger.info("Password updated successfully", {
      category: "authentication",
      action: "update_password",
      actor_type: "user",
      user_id: user.id,
      outcome: "success",
    });

    return {
      success: true,
      message: "パスワードを変更しました",
    };
  } catch (error) {
    handleServerError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      category: "authentication",
      action: "update_password",
      actorType: "user",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      success: false,
      error: "パスワードの変更中にエラーが発生しました",
    };
  }
}
