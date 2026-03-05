import "server-only";

import { headers } from "next/headers";

import { fail, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";

type AuthRateLimitScope =
  | "auth.login"
  | "auth.register"
  | "auth.passwordReset"
  | "auth.emailResend";

type CheckAuthRateLimitOptions = {
  scope: AuthRateLimitScope;
  email: string;
  blockedMessage: string;
  failureLogMessage: string;
  normalizeEmail?: (email: string) => string;
  withConstantDelay?: () => Promise<void>;
};

type AuthRateLimitResult = { allowed: true } | { allowed: false; result: ActionResult<never> };

export async function checkAuthRateLimit(
  options: CheckAuthRateLimitOptions
): Promise<AuthRateLimitResult> {
  try {
    const normalizedEmail = options.normalizeEmail
      ? options.normalizeEmail(options.email)
      : options.email;
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList) ?? undefined;
    const keyInput = buildKey({ scope: options.scope, ip, email: normalizedEmail });
    const rateLimitResult = await enforceRateLimit({
      keys: Array.isArray(keyInput) ? keyInput : [keyInput],
      policy: POLICIES[options.scope],
    });

    if (!rateLimitResult.allowed) {
      if (options.withConstantDelay) {
        await options.withConstantDelay();
      }

      return {
        allowed: false,
        result: fail("RATE_LIMITED", {
          userMessage: options.blockedMessage,
          retryable: true,
        }),
      };
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

  return { allowed: true };
}
