import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { fail, ok } from "@core/errors/adapters/server-actions";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { changePasswordInputSchema } from "@core/validation/settings";

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    // 認証チェック
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 入力値検証
    const rawData = {
      currentPassword: formData.get("currentPassword") as string,
      newPassword: formData.get("newPassword") as string,
    };

    const validationResult = changePasswordInputSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join(", ");
      return fail("VALIDATION_ERROR", { userMessage: errors });
    }

    const { currentPassword, newPassword } = validationResult.data;

    // 現在のパスワードで再認証
    const supabase = await createServerActionSupabaseClient();
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
      return fail("FORBIDDEN", { userMessage: "現在のパスワードが正しくありません" });
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
      return fail("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "パスワードの更新に失敗しました",
      });
    }

    logger.info("Password updated successfully", {
      category: "authentication",
      action: "update_password",
      actor_type: "user",
      user_id: user.id,
      outcome: "success",
    });

    return ok(undefined, { message: "パスワードを変更しました" });
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

    return fail("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      userMessage: "パスワードの変更中にエラーが発生しました",
    });
  }
}
