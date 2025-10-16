"use server";

import * as React from "react";

import { headers } from "next/headers";

import { z } from "zod";

import { InputSanitizer } from "@core/auth-security";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { hmacSha256Hex } from "@core/rate-limit/hash";
import { createClient } from "@core/supabase/server";
import {
  zodErrorToServerActionResponse,
  createServerActionError,
  createServerActionSuccess,
} from "@core/types/server-actions";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJst, formatDateToJstYmd } from "@core/utils/timezone";

import { AdminContactNotice } from "@/emails/contact/AdminContactNotice";

/**
 * お問い合わせ入力スキーマ（サーバー用）
 * クライアント側と同じバリデーションルールを維持
 */
const ContactInputSchema = z.object({
  name: z.string().min(1, "氏名を入力してください").max(100, "氏名は100文字以内で入力してください"),
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(320, "メールアドレスは320文字以内で入力してください"),
  message: z
    .string()
    .min(10, "お問い合わせ内容は10文字以上で入力してください")
    .max(4000, "お問い合わせ内容は4000文字以内で入力してください"),
  consent: z.boolean().refine((val) => val === true, {
    message: "プライバシーポリシーに同意してください",
  }),
});

type ContactInput = z.infer<typeof ContactInputSchema>;

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
 * お問い合わせ送信 Server Action
 */
export async function submitContact(input: ContactInput) {
  // 1. Zod検証
  const parsed = ContactInputSchema.safeParse(input);
  if (!parsed.success) {
    return zodErrorToServerActionResponse(parsed.error);
  }

  const h = headers();
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
      tag: "contact_rate_limited",
      ip_masked: ip ? `${ip.slice(0, 8)}...` : "unknown",
      retry_after: retryAfterSec,
    });
    return createServerActionError(
      "RATE_LIMITED",
      "リクエスト回数の上限に達しました。しばらく待ってから再試行してください",
      { retryable: true, details: { retryAfterSec } }
    );
  }

  // 3. サニタイズ・正規化
  let email: string;
  try {
    email = InputSanitizer.sanitizeEmail(parsed.data.email);
  } catch {
    return createServerActionError("VALIDATION_ERROR", "有効なメールアドレスを入力してください", {
      fieldErrors: [{ field: "email", code: "invalid", message: "メールアドレスが不正です" }],
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
  const ipHash = process.env.RL_HMAC_SECRET && ip ? hmacSha256Hex(ip) : null;

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
        tag: "contact_duplicate",
        email_masked: maskEmail(email),
        fingerprint_hash: fingerprintHash.slice(0, 16),
      });
      return createServerActionError(
        "RESOURCE_CONFLICT",
        "同一内容の短時間での再送は制限しています",
        { retryable: true }
      );
    }

    // その他のDBエラー
    logger.error("Contact DB insert error", {
      tag: "contact_db_error",
      error_code: insertError.code,
      error_message: insertError.message,
      email_masked: maskEmail(email),
    });
    return createServerActionError(
      "INTERNAL_ERROR",
      "お問い合わせの送信に失敗しました。しばらく待ってから再度お試しください。",
      { retryable: true }
    );
  }

  // 7. 成功ログ
  logger.info("Contact submitted successfully", {
    tag: "contact_created",
    email_masked: maskEmail(email),
    fingerprint_hash: fingerprintHash.slice(0, 16),
  });

  // 8. 非同期通知（メール + Slack）
  queueMicrotask(async () => {
    const excerpt = normalizedMessage.slice(0, 500);
    const receivedAt = new Date();

    // メール通知
    try {
      // EmailNotificationService.sendEmailの型に合わせるため動的インポート
      const { EmailNotificationService } = await import("@core/notification/email-service");
      const emailService = new EmailNotificationService();

      const result = await emailService.sendEmail({
        to: process.env.ADMIN_EMAIL || "admin@eventpay.jp",
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
          tag: "contact_notification_failed",
          email_masked: maskEmail(email),
          error: result.error,
          error_type: result.errorType,
        });
      }
    } catch (error) {
      logger.error("Contact notification email exception", {
        tag: "contact_notification_exception",
        email_masked: maskEmail(email),
        error_message: error instanceof Error ? error.message : String(error),
      });
    }

    // Slack通知（任意）
    if (process.env.SLACK_CONTACT_WEBHOOK_URL) {
      try {
        const jstStr = formatUtcToJst(receivedAt, "yyyy-MM-dd HH:mm 'JST'");
        const slackText = `[Contact] ${nameSanitized} <${email}>\n受信: ${jstStr}\n\n${excerpt}`;
        const slackResult = await sendSlackText(slackText);

        if (!slackResult.success) {
          logger.warn("Contact Slack notification failed", {
            tag: "contact_slack_failed",
            error: slackResult.error,
          });
        }
      } catch (error) {
        logger.error("Contact Slack notification exception", {
          tag: "contact_slack_exception",
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  // 9. 成功レスポンス（通知の成否に関わらず）
  return createServerActionSuccess({ ok: true });
}
