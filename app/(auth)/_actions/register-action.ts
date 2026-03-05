"use server";

import { TimingAttackProtection, InputSanitizer } from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { formatUtcToJst } from "@core/utils/timezone";
import { registerInputSchema } from "@core/validation/auth";

import { mapRegisterAuthErrorToFail } from "./_shared/auth-error-mappers";
import { checkAuthRateLimit } from "./_shared/auth-rate-limit";
import { trackAuthEvent } from "./_shared/auth-telemetry";
import { formDataToObject } from "./_shared/form-data";

/**
 * ユーザー登録
 */
export async function registerAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  try {
    const rawData = formDataToObject(formData);
    const result = registerInputSchema.safeParse(rawData);

    if (!result.success) {
      await TimingAttackProtection.addConstantDelay();
      return fail("VALIDATION_ERROR", {
        userMessage: "入力内容を確認してください",
        fieldErrors: result.error.flatten().fieldErrors,
      });
    }

    const { name, email, password } = result.data;

    // 入力値サニタイゼーション（Zodバリデーション後なので基本的なサニタイゼーションのみ）
    const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(password);
    const sanitizedName = name.trim();

    // レート制限チェック（ip + emailHash の AND）
    const rateLimitCheck = await checkAuthRateLimit({
      scope: "auth.register",
      email: sanitizedEmail,
      blockedMessage: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during registration",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (!rateLimitCheck.allowed) {
      return rateLimitCheck.result;
    }

    const supabase = await createServerActionSupabaseClient();

    // ユーザー登録（メール確認必須）
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
            // メール確認後のリダイレクト先は設定しない（OTP方式を使用）
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

      return mapRegisterAuthErrorToFail(signUpError);
    }

    // Database Triggerがpublic.usersプロファイルを自動作成

    trackAuthEvent({
      name: "sign_up",
      method: "password",
      userId: signUpData?.user?.id,
    });

    // Slack通知（新規アカウント作成）
    waitUntil(
      (async () => {
        try {
          const timestamp = new Date().toISOString();
          const jstStr = formatUtcToJst(new Date(), "yyyy-MM-dd HH:mm 'JST'");

          const slackText = `[Account Created]
ユーザー: ${sanitizedName}
登録時刻: ${jstStr} (${timestamp})`;

          const slackResult = await sendSlackText(slackText);

          if (!slackResult.success) {
            logger.warn("Account creation Slack notification failed", {
              category: "system",
              action: "accountCreationSlackFailed",
              error_message: slackResult.error.message,
              error_code: slackResult.error.code,
              retryable: slackResult.error.retryable,
              error_details: slackResult.error.details,
            });
          }
        } catch (error) {
          handleServerError("ADMIN_ALERT_FAILED", {
            category: "system",
            action: "accountCreationSlackException",
            actorType: "system",
            additionalData: {
              error_message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      })()
    );

    // 登録成功（メール確認が必要）
    return ok(
      { user: signUpData?.user },
      {
        needsVerification: true,
        message: "登録が完了しました。確認メールを送信しました。",
        redirectUrl: `/verify-otp?email=${encodeURIComponent(sanitizedEmail)}`,
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
    return fail("REGISTRATION_UNEXPECTED_ERROR", {
      userMessage: "登録処理中にエラーが発生しました",
    });
  }
}
