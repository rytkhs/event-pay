import "server-only";

import { InputSanitizer, TimingAttackProtection } from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { registerInputSchema } from "@core/validation/auth";

import type {
  AuthCommandResult,
  AuthRateLimitScope,
  RegisterCommandInput,
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

function mapRegisterAuthErrorResult(signUpError: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(signUpError, "user_already_exists")) {
    return errResult(
      new AppError("ALREADY_EXISTS", {
        userMessage: "このメールアドレスは既に登録されています",
      })
    );
  }

  if (hasAuthErrorCode(signUpError, "over_email_send_limit")) {
    return errResult(
      new AppError("RATE_LIMITED", {
        userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        retryable: true,
      })
    );
  }

  return errResult(
    new AppError("REGISTRATION_UNEXPECTED_ERROR", {
      userMessage: "登録処理中にエラーが発生しました",
    })
  );
}

export async function registerAction(
  input: RegisterCommandInput
): Promise<AuthCommandResult<{ user: unknown }>> {
  try {
    const validationResult = registerInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { name, email, password } = validationResult.data;

    const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(password);
    const sanitizedName = name.trim();

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.register",
      email: sanitizedEmail,
      ip: input.requestContext.ip,
      blockedMessage: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during registration",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    const registrationResult = await TimingAttackProtection.normalizeResponseTime(
      async () =>
        await supabase.auth.signUp({
          email: sanitizedEmail,
          password: sanitizedPassword,
          options: {
            data: {
              name: sanitizedName,
              terms_agreed: true,
            },
          },
        }),
      400
    );

    const { data: signUpData, error: signUpError } = registrationResult;

    if (signUpError) {
      handleServerError(signUpError, {
        category: "authentication",
        action: "registrationFailed",
        additionalData: {
          sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      return mapRegisterAuthErrorResult(signUpError);
    }

    return okResult(
      {
        user: signUpData?.user,
      },
      {
        needsVerification: true,
        message: "登録が完了しました。確認メールを送信しました。",
        redirectUrl: `/verify-otp?email=${encodeURIComponent(sanitizedEmail)}`,
        sideEffects: {
          telemetry: {
            name: "sign_up",
            method: "password",
            userId: signUpData?.user?.id,
          },
          accountCreatedSlack: {
            userName: sanitizedName,
          },
        },
      }
    );
  } catch (error) {
    handleServerError("REGISTRATION_UNEXPECTED_ERROR", {
      action: "registerActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("REGISTRATION_UNEXPECTED_ERROR", {
        userMessage: "登録処理中にエラーが発生しました",
      })
    );
  }
}
