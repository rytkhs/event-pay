"use server";

import { z } from "zod";

import type { ActionResult } from "@core/actions/auth";
import { getCurrentUser } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";

const updateEmailSchema = z.object({
  newEmail: z
    .string()
    .min(1, "新しいメールアドレスを入力してください")
    .email("有効なメールアドレスを入力してください"),
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
});

export async function updateEmailAction(formData: FormData): Promise<ActionResult> {
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
      newEmail: formData.get("newEmail") as string,
      currentPassword: formData.get("currentPassword") as string,
    };

    const validationResult = updateEmailSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join(", ");
      return {
        success: false,
        error: errors,
      };
    }

    const { newEmail, currentPassword } = validationResult.data;

    // 現在のメールアドレスと同じかチェック
    if (user.email === newEmail) {
      return {
        success: false,
        error: "現在のメールアドレスと同じです",
      };
    }

    const supabase = createClient();

    // 現在のパスワードで再認証
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email || "",
      password: currentPassword,
    });

    if (signInError) {
      logger.warn("Email change reauthentication failed", {
        tag: "emailChangeReauthFailed",
        user_id: user.id,
        error_message: signInError.message,
      });
      return {
        success: false,
        error: "現在のパスワードが正しくありません",
      };
    }

    // メールアドレス更新（確認メール送信）
    const { error: updateError } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (updateError) {
      logger.error("Email update failed", {
        tag: "emailUpdateFailed",
        user_id: user.id,
        error_message: updateError.message,
      });
      return {
        success: false,
        error: "メールアドレスの更新に失敗しました",
      };
    }

    logger.info("Email change initiated", {
      tag: "emailChangeInitiated",
      user_id: user.id,
      old_email: user.email,
      new_email: newEmail,
    });

    return {
      success: true,
      message: "確認メールを送信しました。新しいメールアドレスで確認リンクをクリックしてください。",
    };
  } catch (error) {
    logger.error("Update email action error", {
      tag: "updateEmailActionError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: "メールアドレスの変更中にエラーが発生しました",
    };
  }
}
