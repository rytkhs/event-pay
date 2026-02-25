import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { fail, ok } from "@core/errors/adapters/server-actions";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { updateEmailInputSchema } from "@core/validation/settings";

export async function updateEmailAction(formData: FormData): Promise<ActionResult> {
  try {
    // 認証チェック
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 入力値検証
    const rawData = {
      newEmail: formData.get("newEmail") as string,
      currentPassword: formData.get("currentPassword") as string,
    };

    const validationResult = updateEmailInputSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join(", ");
      return fail("VALIDATION_ERROR", { userMessage: errors });
    }

    const { newEmail, currentPassword } = validationResult.data;

    // 現在のメールアドレスと同じかチェック
    if (user.email === newEmail) {
      return fail("RESOURCE_CONFLICT", { userMessage: "現在のメールアドレスと同じです" });
    }

    const supabase = await createServerActionSupabaseClient();

    // 現在のパスワードで再認証
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email || "",
      password: currentPassword,
    });

    if (signInError) {
      logger.warn("Email change reauthentication failed", {
        category: "authentication",
        action: "update_email",
        actor_type: "user",
        user_id: user.id,
        error_message: signInError.message,
        outcome: "failure",
      });
      return fail("FORBIDDEN", { userMessage: "現在のパスワードが正しくありません" });
    }

    // メールアドレス更新（確認メール送信）
    const { error: updateError } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (updateError) {
      handleServerError(updateError, {
        category: "authentication",
        action: "update_email",
        actorType: "user",
        userId: user.id,
      });
      return fail("EMAIL_UPDATE_UNEXPECTED_ERROR", {
        userMessage: "メールアドレスの更新に失敗しました",
      });
    }

    logger.info("Email change initiated", {
      category: "authentication",
      action: "update_email",
      actor_type: "user",
      user_id: user.id,
      old_email: user.email,
      new_email: newEmail,
      outcome: "success",
    });

    return ok(undefined, {
      message: "確認メールを送信しました。新しいメールアドレスで確認リンクをクリックしてください。",
    });
  } catch (error) {
    handleServerError("EMAIL_UPDATE_UNEXPECTED_ERROR", {
      category: "authentication",
      action: "update_email",
      actorType: "user",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return fail("EMAIL_UPDATE_UNEXPECTED_ERROR", {
      userMessage: "メールアドレスの変更中にエラーが発生しました",
    });
  }
}
