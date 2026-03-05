import "server-only";

import { AppError, errResult, okResult } from "@core/errors";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { completePasswordResetInputSchema } from "@core/validation/auth";

import type {
  AuthCommandResult,
  CompletePasswordResetCommandInput,
} from "../auth-command-service.types";
import { logAuthError } from "../shared/auth-logging";
import { validationErrorResult } from "../shared/auth-validation-error";

export async function completePasswordResetAction(
  input: CompletePasswordResetCommandInput
): Promise<AuthCommandResult> {
  try {
    const validationResult = completePasswordResetInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { password } = validationResult.data;
    const supabase = await createServerActionSupabaseClient();

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return errResult(
        new AppError("TOKEN_EXPIRED", {
          userMessage: "セッションが期限切れです。確認コードを再入力してください",
        }),
        {
          redirectUrl: "/verify-otp",
        }
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      logAuthError(updateError, {
        action: "updatePasswordFailed",
        actorType: "user",
      });
      return errResult(
        new AppError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
          userMessage: "パスワードの更新に失敗しました",
        })
      );
    }

    return okResult(undefined, {
      message: "パスワードが更新されました",
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    handleServerError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      action: "updatePasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "処理中にエラーが発生しました",
      })
    );
  }
}
