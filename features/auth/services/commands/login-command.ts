import "server-only";

import {
  AccountLockoutService,
  TimingAttackProtection,
  type LockoutStatus,
} from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { formatUtcToJst } from "@core/utils/timezone";
import { loginInputSchema } from "@core/validation/auth";

import type { AuthCommandResult, LoginCommandInput } from "../auth-command-service.types";
import { mapLoginAuthErrorResult } from "../shared/auth-error-mappers";
import { logAuthError } from "../shared/auth-logging";
import { checkAuthRateLimit } from "../shared/auth-rate-limit";
import { sanitizeEmailOrNull, sanitizePasswordOrNull } from "../shared/auth-sanitizer";
import { validationErrorResult } from "../shared/auth-validation-error";

export async function loginAction(
  input: LoginCommandInput
): Promise<AuthCommandResult<{ user: unknown }>> {
  try {
    const validationResult = loginInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { email, password } = validationResult.data;

    const sanitizedEmail = sanitizeEmailOrNull(email);
    const sanitizedPassword = sanitizePasswordOrNull(password);

    if (!sanitizedEmail || !sanitizedPassword) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult("入力内容を確認してください");
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.login",
      email: sanitizedEmail,
      ip: input.requestContext.ip,
      blockedMessage: "ログイン試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const lockoutStatus: LockoutStatus =
      await AccountLockoutService.checkLockoutStatus(sanitizedEmail);
    if (lockoutStatus.isLocked) {
      await TimingAttackProtection.normalizeResponseTime(async () => {}, 300);
      return errResult(
        new AppError("FORBIDDEN", {
          userMessage: `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt ? formatUtcToJst(lockoutStatus.lockoutExpiresAt, "HH:mm") : ""}頃に再試行してください。`,
        })
      );
    }

    const supabase = await createServerActionSupabaseClient();

    const authResult = await TimingAttackProtection.normalizeResponseTime(
      async () =>
        await supabase.auth.signInWithPassword({
          email: sanitizedEmail,
          password: sanitizedPassword,
        }),
      300
    );

    const { data: signInData, error: signInError } = authResult;

    if (signInError) {
      logAuthError(signInError, {
        action: "loginFailed",
        email: sanitizedEmail,
      });

      const lockoutResult = await AccountLockoutService.recordFailedAttempt(sanitizedEmail);
      return mapLoginAuthErrorResult({
        signInError,
        sanitizedEmail,
        lockoutResult,
      });
    }

    await AccountLockoutService.clearFailedAttempts(sanitizedEmail);

    return okResult(
      {
        user: signInData?.user,
      },
      {
        message: "ログインしました",
        redirectUrl: "/dashboard",
        sideEffects: {
          telemetry: {
            name: "login",
            method: "password",
            userId: signInData?.user?.id,
          },
        },
      }
    );
  } catch (error) {
    handleServerError("LOGIN_UNEXPECTED_ERROR", {
      action: "loginActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("LOGIN_UNEXPECTED_ERROR", {
        userMessage: "ログイン処理中にエラーが発生しました",
      })
    );
  }
}
