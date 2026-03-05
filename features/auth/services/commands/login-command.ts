import "server-only";

import {
  ACCOUNT_LOCKOUT_CONFIG,
  AccountLockoutService,
  InputSanitizer,
  TimingAttackProtection,
  type LockoutResult,
  type LockoutStatus,
} from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { formatUtcToJst } from "@core/utils/timezone";
import { loginInputSchema } from "@core/validation/auth";

import type {
  AuthCommandResult,
  AuthRateLimitScope,
  LoginCommandInput,
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

function mapLoginAuthErrorResult(params: {
  signInError: unknown;
  sanitizedEmail: string;
  lockoutResult: LockoutResult;
}): AuthCommandResult<never> {
  if (params.lockoutResult.isLocked) {
    return errResult(
      new AppError("FORBIDDEN", {
        userMessage: "アカウントがロックされました。しばらく時間をおいてからお試しください。",
      })
    );
  }

  if (hasAuthErrorCode(params.signInError, "email_not_confirmed")) {
    return errResult(
      new AppError("LOGIN_FAILED", {
        userMessage: "メールアドレスの確認が必要です。",
      }),
      {
        redirectUrl: `/verify-email?email=${encodeURIComponent(params.sanitizedEmail)}`,
        needsVerification: true,
      }
    );
  }

  let errorMessage = "メールアドレスまたはパスワードが正しくありません";

  if (params.lockoutResult.failedAttempts >= 3) {
    const remaining =
      ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts - params.lockoutResult.failedAttempts;
    errorMessage += ` (残り${remaining}回の試行でアカウントがロックされます)`;
  }

  return errResult(
    new AppError("LOGIN_FAILED", {
      userMessage: errorMessage,
    })
  );
}

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

    let sanitizedEmail: string;
    let sanitizedPassword: string;

    try {
      sanitizedEmail = InputSanitizer.sanitizeEmail(email);
      sanitizedPassword = InputSanitizer.sanitizePassword(password);
    } catch {
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
      handleServerError(signInError, {
        category: "authentication",
        action: "loginFailed",
        additionalData: {
          sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
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
