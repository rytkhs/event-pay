"use server";

import { cookies, headers } from "next/headers";

import { TimingAttackProtection, InputSanitizer } from "@core/auth-security";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit/index";
import { hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { formatUtcToJst } from "@core/utils/timezone";
import { registerInputSchema } from "@core/validation/auth";

function formDataToObject(formData: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value.toString();
  }
  return data;
}

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
    try {
      const headersList = await headers();
      const ip = getClientIPFromHeaders(headersList) ?? undefined;
      const keyInput = buildKey({ scope: "auth.register", ip, email: sanitizedEmail });
      const rateLimitResult = await enforceRateLimit({
        keys: Array.isArray(keyInput) ? keyInput : [keyInput],
        policy: POLICIES["auth.register"],
      });
      if (!rateLimitResult.allowed) {
        await TimingAttackProtection.addConstantDelay();
        return fail("RATE_LIMITED", {
          userMessage: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          retryable: true,
        });
      }
    } catch (rateLimitError) {
      logger.warn("Rate limit check failed during registration", {
        category: "security",
        action: "rateLimitCheckFailed",
        error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
        error_message:
          rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
      });
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

      // ユーザー列挙攻撃対策: 詳細なエラー情報を隠す
      let errorMessage = "登録処理中にエラーが発生しました";
      let errorCode: "ALREADY_EXISTS" | "RATE_LIMITED" | "REGISTRATION_UNEXPECTED_ERROR" =
        "REGISTRATION_UNEXPECTED_ERROR";

      if (hasAuthErrorCode(signUpError, "user_already_exists")) {
        // 既存ユーザー情報の漏洩を防ぐため、統一されたメッセージ
        errorMessage = "このメールアドレスは既に登録されています";
        errorCode = "ALREADY_EXISTS";
      } else if (hasAuthErrorCode(signUpError, "over_email_send_limit")) {
        errorMessage = "送信回数の上限に達しました。しばらく時間をおいてからお試しください";
        errorCode = "RATE_LIMITED";
      }

      return fail(errorCode, {
        userMessage: errorMessage,
        retryable: errorCode === "RATE_LIMITED",
      });
    }

    // Database Triggerがpublic.usersプロファイルを自動作成

    // GA4: サインアップイベントを送信（非同期、エラーは無視）
    waitUntil(
      (async () => {
        try {
          const { ga4Server } = await import("@core/analytics/ga4-server");

          // _ga CookieからClient IDを取得
          const cookieStore = await cookies();
          const gaCookie = cookieStore.get("_ga")?.value;
          const clientId = extractClientIdFromGaCookie(gaCookie);

          // ユーザーIDを取得（Client IDがない場合のフォールバック）
          const userId = signUpData?.user?.id;

          await ga4Server.sendEvent(
            {
              name: "sign_up",
              params: {
                method: "password",
              },
            },
            clientId ?? undefined,
            userId,
            undefined, // sessionId（現時点では未設定）
            undefined // engagementTimeMsec（現時点では未設定）
          );
        } catch (error) {
          logger.debug("[GA4] Failed to send sign_up event", {
            category: "system",
            action: "ga4SignUpEventFailed",
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      })()
    );

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
