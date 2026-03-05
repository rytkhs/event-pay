import { AppError, errResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";

import type { AuthCommandResult, AuthRateLimitScope } from "../auth-command-service.types";

export type AuthRateLimitOptions = {
  scope: AuthRateLimitScope;
  email: string;
  ip?: string;
  blockedMessage: string;
  failureLogMessage: string;
  normalizeEmail?: (email: string) => string;
  withConstantDelay?: () => Promise<void>;
};

export async function checkAuthRateLimit(
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
    // Availability-first: rate-limit backend failure should not block auth flows.
    logger.warn(options.failureLogMessage, {
      category: "security",
      action: "rateLimitCheckFailed",
      rate_limit_policy: "fail-open",
      error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
      error_message:
        rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
    });
  }

  return null;
}
