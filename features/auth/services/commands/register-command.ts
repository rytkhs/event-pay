import "server-only";

import { TimingAttackProtection } from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { registerInputSchema } from "@core/validation/auth";

import type { AuthCommandResult, RegisterCommandInput } from "../auth-command-service.types";
import { mapRegisterAuthErrorResult } from "../shared/auth-error-mappers";
import { logAuthError } from "../shared/auth-logging";
import { checkAuthRateLimit } from "../shared/auth-rate-limit";
import {
  sanitizeEmailOrNull,
  sanitizeName,
  sanitizePasswordOrNull,
} from "../shared/auth-sanitizer";
import { validationErrorResult } from "../shared/auth-validation-error";

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

    const sanitizedEmail = sanitizeEmailOrNull(email);
    const sanitizedPassword = sanitizePasswordOrNull(password);

    if (!sanitizedEmail || !sanitizedPassword) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult("入力内容を確認してください");
    }

    const sanitizedName = sanitizeName(name);

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
      logAuthError(signUpError, {
        action: "registrationFailed",
        email: sanitizedEmail,
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
