import { revalidatePath } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { fail, ok } from "@core/errors/adapters/server-actions";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { updateProfileInputSchema } from "@core/validation/settings";

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  try {
    // 認証チェック
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 入力値検証
    const rawData = {
      name: formData.get("name") as string,
    };

    const validationResult = updateProfileInputSchema.safeParse(rawData);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message).join(", ");
      return fail("VALIDATION_ERROR", { userMessage: errors });
    }

    const { name } = validationResult.data;

    // データベース更新
    const supabase = await createServerActionSupabaseClient();
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
      return fail("DATABASE_ERROR", { userMessage: "プロフィールの更新に失敗しました" });
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

    return ok(undefined, { message: "プロフィールを更新しました" });
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

    return fail("PROFILE_UPDATE_UNEXPECTED_ERROR", {
      userMessage: "プロフィールの更新中にエラーが発生しました",
    });
  }
}
