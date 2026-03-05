import "server-only";

import { InputSanitizer, TimingAttackProtection } from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";
import { isResetPasswordResult } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { resetPasswordInputSchema } from "@core/validation/auth";

import type {
  AuthCommandResult,
  AuthRateLimitScope,
  ResetPasswordCommandInput,
} from "../auth-command-service.types";

type AuthRateLimitOptions = {
  scope: AuthRateLimitScope;
  email: string;
  ip?: string;
  blockedMessage: string;
  failureLogMessage: string;
  normalizeEmail?: (email: string) => string;
  withConstantDelay?: () => Promise<void>;
};

function validationErrorResult(
  userMessage: string,
  fieldErrors?: Record<string, string[] | undefined>
): AuthCommandResult<never> {
  return errResult(
    new AppError("VALIDATION_ERROR", {
      userMessage,
      details: fieldErrors,
    })
  );
}

async function checkAuthRateLimit(
  options: AuthRateLimitOptions
): Promise<AuthCommandResult<never> | null> {
  try {
    const normalizedEmail = options.normalizeEmail
      ? options.normalizeEmail(options.email)
      : options.email;

    const keyInput = buildKey({
      scope: options.scope,
      ip: options.ip,
      email: normalizedEmail,
    });

    const rateLimitResult = await enforceRateLimit({
      keys: Array.isArray(keyInput) ? keyInput : [keyInput],
      policy: POLICIES[options.scope],
    });

    if (!rateLimitResult.allowed) {
      if (options.withConstantDelay) {
        await options.withConstantDelay();
      }

      return errResult(
        new AppError("RATE_LIMITED", {
          userMessage: options.blockedMessage,
          retryable: true,
        })
      );
    }
  } catch (rateLimitError) {
    logger.warn(options.failureLogMessage, {
      category: "security",
      action: "rateLimitCheckFailed",
      error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
      error_message:
        rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
    });
  }

  return null;
}

export async function resetPasswordAction(
  input: ResetPasswordCommandInput
): Promise<AuthCommandResult> {
  try {
    const validationResult = resetPasswordInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "有効なメールアドレスを入力してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    let { email } = validationResult.data;

    try {
      email = InputSanitizer.sanitizeEmail(email);
    } catch {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult("有効なメールアドレスを入力してください");
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.passwordReset",
      email,
      ip: input.requestContext.ip,
      blockedMessage:
        "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during password reset",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    const resetResult = await TimingAttackProtection.normalizeResponseTime(
      async () => await supabase.auth.resetPasswordForEmail(email),
      300
    );

    if (isResetPasswordResult(resetResult) && resetResult.error) {
      handleServerError(resetResult.error, {
        category: "authentication",
        action: "resetPasswordOtpFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });
    }

    return okResult(undefined, {
      message: "パスワードリセット用の確認コードを送信しました（登録済みのアドレスの場合）",
      needsVerification: true,
      redirectUrl: `/verify-otp?email=${encodeURIComponent(email)}&type=recovery`,
    });
  } catch (error) {
    handleServerError("RESET_PASSWORD_UNEXPECTED_ERROR", {
      action: "resetPasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("RESET_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "処理中にエラーが発生しました",
      })
    );
  }
}
