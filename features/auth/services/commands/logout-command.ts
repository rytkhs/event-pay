import "server-only";

import { TimingAttackProtection } from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";

import type { AuthCommandResult } from "../auth-command-service.types";

export async function logoutAction(): Promise<AuthCommandResult> {
  try {
    const supabase = await createServerActionSupabaseClient();

    let userId: string | undefined;
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id;
    } catch {
      // ユーザー取得エラーは無視
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.warn("Logout error (non-critical)", {
        category: "authentication",
        action: "logoutError",
        error_message: error.message,
      });
    }

    return okResult(undefined, {
      message: "ログアウトしました",
      redirectUrl: "/login",
      sideEffects: {
        telemetry: {
          name: "logout",
          userId,
        },
      },
    });
  } catch (error) {
    const appError = new AppError("LOGOUT_UNEXPECTED_ERROR", {
      userMessage: "ログアウト処理中にエラーが発生しました。再度お試しください。",
      cause: error,
    });

    handleServerError(appError, {
      action: "logoutActionError",
    });

    await TimingAttackProtection.addConstantDelay();
    return errResult(appError, {
      redirectUrl: "/login",
    });
  }
}
