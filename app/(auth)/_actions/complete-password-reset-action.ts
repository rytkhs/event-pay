"use server";

import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { completePasswordResetInputSchema } from "@core/validation/auth";

function formDataToObject(formData: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value.toString();
  }
  return data;
}

/**
 * パスワード更新（リセット後）
 */
export async function completePasswordResetAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = completePasswordResetInputSchema.safeParse(rawData);

    if (!result.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { password } = result.data;
    const supabase = await createServerActionSupabaseClient();

    // セッション存在チェック
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return fail("TOKEN_EXPIRED", {
        userMessage: "セッションが期限切れです。確認コードを再入力してください",
        redirectUrl: "/verify-otp",
      });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      handleServerError(updateError, {
        category: "authentication",
        action: "updatePasswordFailed",
        actorType: "user",
      });
      return fail("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "パスワードの更新に失敗しました",
      });
    }

    return ok(undefined, { message: "パスワードが更新されました", redirectUrl: "/dashboard" });
  } catch (error) {
    handleServerError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      action: "updatePasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return fail("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      userMessage: "処理中にエラーが発生しました",
    });
  }
}
