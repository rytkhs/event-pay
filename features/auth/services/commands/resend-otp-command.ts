import "server-only";

import { InputSanitizer } from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { emailCheckSchema } from "@core/validation/auth";

import type {
  AuthCommandResult,
  AuthRateLimitScope,
  ResendOtpCommandInput,
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

function mapResendOtpErrorResult(error: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(error, "over_email_send_limit")) {
    return errResult(
      new AppError("RATE_LIMITED", {
        userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        retryable: true,
      })
    );
  }

  return errResult(
    new AppError("RESEND_OTP_UNEXPECTED_ERROR", {
      userMessage: "再送信中にエラーが発生しました",
    })
  );
}

export async function resendOtpAction(input: ResendOtpCommandInput): Promise<AuthCommandResult> {
  try {
    const email = input.email;
    const type = input.type ?? "signup";

    if (!email || !emailCheckSchema.safeParse(email).success) {
      return errResult(
        new AppError("VALIDATION_ERROR", {
          userMessage: "有効なメールアドレスを入力してください",
        })
      );
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.emailResend",
      email,
      ip: input.requestContext.ip,
      blockedMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during email resend",
      normalizeEmail: InputSanitizer.sanitizeEmail,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    let resendResult;

    if (type === "recovery") {
      resendResult = await supabase.auth.resetPasswordForEmail(email);
    } else if (type === "signup" || type === "email_change") {
      resendResult = await supabase.auth.resend({
        type: type as "signup" | "email_change",
        email,
      });
    } else {
      return errResult(
        new AppError("INVALID_REQUEST", {
          userMessage: "このタイプの再送信は現在サポートしていません",
        })
      );
    }

    if (resendResult.error) {
      handleServerError(resendResult.error, {
        category: "authentication",
        action: "resendOtpFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      return mapResendOtpErrorResult(resendResult.error);
    }

    return okResult(undefined, {
      message: "確認コードを再送信しました",
    });
  } catch (error) {
    handleServerError("RESEND_OTP_UNEXPECTED_ERROR", {
      action: "resendOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("RESEND_OTP_UNEXPECTED_ERROR", {
        userMessage: "再送信中にエラーが発生しました",
      })
    );
  }
}
