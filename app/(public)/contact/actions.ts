"use server";

import * as React from "react";

import { headers } from "next/headers";

import { InputSanitizer } from "@core/auth-security";
import { zodFail, fail, ok } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { hmacSha256Hex } from "@core/rate-limit/hash";
import { createClient } from "@core/supabase/server";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJst, formatDateToJstYmd } from "@core/utils/timezone";
import { ContactInputSchema, type ContactInput } from "@core/validation/contact";

import AdminContactNotice from "@/emails/contact/AdminContactNotice";

/**
 * メールアドレスをマスクする（ログ用）
 */
function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 1)}${"*".repeat(local.length - 1)}@${domain}`;
}

/**
 * お問い合わせ送信
 */
export async function submitContact(input: ContactInput) {
  // 1. Zod検証
  const parsed = ContactInputSchema.safeParse(input);
  if (!parsed.success) {
    return zodFail(parsed.error);
  }

  const h = await headers();
  const ip = getClientIPFromHeaders(h);

  // 2. レート制限チェック
  const rateLimitKey = buildKey({ scope: "contact.submit", ip });
  const rateLimitKeys = Array.isArray(rateLimitKey) ? rateLimitKey : [rateLimitKey];
  const rl = await enforceRateLimit({
    keys: rateLimitKeys,
    policy: POLICIES["contact.submit"],
  });

  if (!rl.allowed) {
    const retryAfterSec = rl.retryAfter ?? Math.ceil(POLICIES["contact.submit"].blockMs / 1000);
    logger.warn("Contact form rate limited", {
      category: "security",
      action: "contact_rate_limited",
      actor_type: "anonymous",
      ip_masked: ip ? `${ip.slice(0, 8)}...` : "unknown",
      retry_after: retryAfterSec,
      outcome: "failure",
    });
    return fail("RATE_LIMITED", {
      userMessage: "リクエスト回数の上限に達しました。しばらく待ってから再試行してください",
      retryable: true,
      details: { retryAfterSec },
    });
  }

  // 3. サニタイズ・正規化
  let email: string;
  try {
    email = InputSanitizer.sanitizeEmail(parsed.data.email);
  } catch {
    return fail("VALIDATION_ERROR", {
      userMessage: "有効なメールアドレスを入力してください",
      fieldErrors: {
        email: ["メールアドレスが不正です"],
      },
    });
  }
  const messageSanitized = sanitizeForEventPay(parsed.data.message);
  const normalizedMessage = messageSanitized.trim().replace(/\s+/g, " ");
  const nameSanitized = sanitizeForEventPay(parsed.data.name).trim();

  // 4. 指紋ハッシュ生成（同日・同内容の重複防止）
  const dayJst = formatDateToJstYmd(new Date()); // JST基準のYYYY-MM-DD
  const fingerprintHash = hmacSha256Hex(`${email}|${normalizedMessage}|${dayJst}`);

  // 5. メタデータ収集
  const userAgent = h.get("user-agent") ?? null;
  const ipHash = getEnv().RL_HMAC_SECRET && ip ? hmacSha256Hex(ip) : null;

  // 6. DB保存
  const supabase = createClient();
  const { error: insertError } = await supabase.from("contacts").insert({
    name: nameSanitized,
    email,
    message: normalizedMessage,
    fingerprint_hash: fingerprintHash,
    user_agent: userAgent,
    ip_hash: ipHash,
  });

  // エラーハンドリング
  if (insertError) {
    // 重複エラー（ユニーク制約違反）
    if (insertError.code === "23505") {
      logger.warn("Contact duplicate submission blocked", {
        category: "security",
        action: "contact_duplicate",
        actor_type: "anonymous",
        email_masked: maskEmail(email),
        fingerprint_hash: fingerprintHash.slice(0, 16),
        outcome: "failure",
      });
      return fail("RESOURCE_CONFLICT", {
        userMessage: "同一内容の短時間での再送は制限しています",
        retryable: true,
      });
    }

    // その他のDBエラー
    handleServerError(insertError, {
      category: "system",
      action: "contact_db_error",
      additionalData: { email_masked: maskEmail(email) },
    });
    return fail("INTERNAL_ERROR", {
      userMessage: "お問い合わせの送信に失敗しました。しばらく待ってから再度お試しください。",
      retryable: true,
    });
  }

  // 7. 成功ログ
  logger.info("Contact submitted successfully", {
    category: "system",
    action: "contact_created",
    actor_type: "anonymous",
    email_masked: maskEmail(email),
    fingerprint_hash: fingerprintHash.slice(0, 16),
    outcome: "success",
  });

  // 8. 非同期通知（メール + Slack）
  waitUntil(
    (async () => {
      const excerpt = normalizedMessage.slice(0, 500);
      const receivedAt = new Date();

      // メール通知
      try {
        // EmailNotificationService.sendEmailの型に合わせるため動的インポート
        const { EmailNotificationService } = await import("@core/notification/email-service");
        const emailService = new EmailNotificationService();

        const result = await emailService.sendEmail({
          to: getEnv().ADMIN_EMAIL || "admin@eventpay.jp",
          template: {
            subject: "【みんなの集金】新しいお問い合わせが届きました",
            react: React.createElement(AdminContactNotice, {
              name: nameSanitized,
              email,
              messageExcerpt: excerpt,
              receivedAt,
            }),
          },
        });

        if (!result.success) {
          logger.warn("Contact notification email failed", {
            category: "email",
            action: "contact_notification_failed",
            actor_type: "system",
            email_masked: maskEmail(email),
            error_message: result.error.message,
            error_code: result.error.code,
            retryable: result.error.retryable,
            error_details: result.error.details,
            error_type: result.meta?.errorType,
            outcome: "failure",
          });
        }
      } catch (error) {
        handleServerError(error, {
          category: "email",
          action: "contact_notification_exception",
          additionalData: { email_masked: maskEmail(email) },
        });
      }

      // Slack通知（任意）
      if (getEnv().SLACK_CONTACT_WEBHOOK_URL) {
        try {
          const jstStr = formatUtcToJst(receivedAt, "yyyy-MM-dd HH:mm 'JST'");
          const slackText = `[Contact] ${nameSanitized} <${email}>\n受信: ${jstStr}\n\n${excerpt}`;
          const slackResult = await sendSlackText(slackText);

          if (!slackResult.success) {
            logger.warn("Contact Slack notification failed", {
              category: "system",
              action: "contact_slack_failed",
              actor_type: "system",
              error_message: slackResult.error.message,
              error_code: slackResult.error.code,
              retryable: slackResult.error.retryable,
              error_details: slackResult.error.details,
              outcome: "failure",
            });
          }
        } catch (error) {
          handleServerError(error, {
            category: "system",
            action: "contact_slack_exception",
          });
        }
      }
    })()
  );

  // 9. 成功レスポンス（通知の成否に関わらず）
  return ok();
}
