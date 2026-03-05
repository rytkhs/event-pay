"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { TimingAttackProtection } from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";

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

    // GA4: ログアウトイベントを送信（非同期、エラーは無視）
    waitUntil(
      (async () => {
        try {
          const { ga4Server } = await import("@core/analytics/ga4-server");

          // _ga CookieからClient IDを取得
          const cookieStore = await cookies();
          const gaCookie = cookieStore.get("_ga")?.value;
          const clientId = extractClientIdFromGaCookie(gaCookie);

          await ga4Server.sendEvent(
            {
              name: "logout",
              params: {},
            },
            clientId ?? undefined,
            userId,
            undefined, // sessionId（現時点では未設定）
            undefined // engagementTimeMsec（現時点では未設定）
          );
        } catch (error) {
          logger.debug("[GA4] Failed to send logout event", {
            category: "system",
            action: "ga4LogoutEventFailed",
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      })()
    );

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
