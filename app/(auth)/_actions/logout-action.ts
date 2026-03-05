"use server";

import { revalidatePath } from "next/cache";

import { TimingAttackProtection } from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";

import { trackAuthEvent } from "./_shared/auth-telemetry";

/**
 * ログアウト
 */
export async function logoutAction(): Promise<ActionResult> {
  try {
    const supabase = await createServerActionSupabaseClient();

    // ユーザーIDを取得（GA4イベント送信用）
    let userId: string | undefined;
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id;
    } catch {
      // ユーザー取得エラーは無視
    }

    // ログアウト実行（認証状態に関係なく実行）
    const { error } = await supabase.auth.signOut();

    revalidatePath("/", "layout");

    if (error) {
      logger.warn("Logout error (non-critical)", {
        category: "authentication",
        action: "logoutError",
        error_message: error.message,
      });
    }

    trackAuthEvent({ name: "logout", userId });

    return ok(undefined, { message: "ログアウトしました", redirectUrl: "/login" });
  } catch (error) {
    handleServerError("LOGOUT_UNEXPECTED_ERROR", {
      action: "logoutActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return fail("LOGOUT_UNEXPECTED_ERROR", {
      userMessage: "ログアウト処理中にエラーが発生しました。再度お試しください。",
      redirectUrl: "/login",
    });
  }
}
