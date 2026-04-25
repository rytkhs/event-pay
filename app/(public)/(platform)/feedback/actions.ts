"use server";

import { headers } from "next/headers";

import { InputSanitizer } from "@core/auth-security";
import { fail, ok, type ActionResult, zodFail } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { hmacSha256Hex } from "@core/rate-limit/hash";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { maskEmail } from "@core/utils/mask";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatDateToJstYmd } from "@core/utils/timezone";
import {
  FeedbackInputSchema,
  feedbackCategoryLabels,
  type FeedbackInput,
} from "@core/validation/feedback";
import {
  canonicalizeContactMessageForFingerprint,
  hasValidContactMessageContent,
  normalizeContactMessageForStorage,
} from "@core/validation/contact-message";

function nullableSanitizedText(input: string): string | null {
  const sanitized = sanitizeForEventPay(input).trim();
  return sanitized.length > 0 ? sanitized : null;
}

export async function submitFeedback(input: FeedbackInput): Promise<ActionResult<void>> {
  const parsed = FeedbackInputSchema.safeParse(input);
  if (!parsed.success) {
    return zodFail(parsed.error);
  }

  const h = await headers();
  const ip = getClientIPFromHeaders(h) ?? undefined;

  const rateLimitKey = buildKey({ scope: "feedback.submit", ip });
  const rateLimitKeys = Array.isArray(rateLimitKey) ? rateLimitKey : [rateLimitKey];
  const rl = await enforceRateLimit({
    keys: rateLimitKeys,
    policy: POLICIES["feedback.submit"],
  });

  if (!rl.allowed) {
    const retryAfterSec = rl.retryAfter ?? Math.ceil(POLICIES["feedback.submit"].blockMs / 1000);
    logger.warn("Feedback form rate limited", {
      category: "security",
      action: "feedback_rate_limited",
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

  const emailInput = parsed.data.email.trim();
  let email: string | null = null;
  if (emailInput.length > 0) {
    try {
      email = InputSanitizer.sanitizeEmail(emailInput);
    } catch {
      return fail("VALIDATION_ERROR", {
        userMessage: "有効なメールアドレスを入力してください",
        fieldErrors: {
          email: ["メールアドレスが不正です"],
        },
      });
    }
  }

  const messageSanitized = sanitizeForEventPay(parsed.data.message);
  const messageForStorage = normalizeContactMessageForStorage(messageSanitized);
  const messageForFingerprint = canonicalizeContactMessageForFingerprint(messageSanitized);

  if (!hasValidContactMessageContent(messageForStorage)) {
    return fail("VALIDATION_ERROR", {
      userMessage: "入力内容を確認してください",
      fieldErrors: {
        message: ["内容は10文字以上で入力してください"],
      },
    });
  }

  const name = nullableSanitizedText(parsed.data.name);
  const pageContext = nullableSanitizedText(parsed.data.pageContext);
  const dayJst = formatDateToJstYmd(new Date());
  const userAgent = h.get("user-agent") ?? null;
  const ipHash = process.env.RL_HMAC_SECRET && ip ? hmacSha256Hex(ip) : null;
  const submitterKey = email ?? ipHash ?? "anonymous";
  const fingerprintHash = hmacSha256Hex(
    `${parsed.data.category}|${submitterKey}|${messageForFingerprint}|${dayJst}`
  );

  const supabase = await createServerActionSupabaseClient();
  const { error: insertError } = await supabase.from("feedbacks").insert({
    category: parsed.data.category,
    message: messageForStorage,
    page_context: pageContext,
    name,
    email,
    fingerprint_hash: fingerprintHash,
    user_agent: userAgent,
    ip_hash: ipHash,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      logger.warn("Feedback duplicate submission blocked", {
        category: "security",
        action: "feedback_duplicate",
        actor_type: "anonymous",
        feedback_category: parsed.data.category,
        email_masked: email ? maskEmail(email) : null,
        fingerprint_hash: fingerprintHash.slice(0, 16),
        outcome: "failure",
      });

      return fail("RESOURCE_CONFLICT", {
        userMessage: "同一内容の短時間での再送は制限しています",
        retryable: true,
      });
    }

    handleServerError(insertError, {
      category: "system",
      action: "feedback_db_error",
      additionalData: {
        feedback_category: parsed.data.category,
        email_masked: email ? maskEmail(email) : null,
      },
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "フィードバックの送信に失敗しました。しばらく待ってから再度お試しください。",
      retryable: true,
    });
  }

  logger.info("Feedback submitted successfully", {
    category: "system",
    action: "feedback_created",
    actor_type: "anonymous",
    feedback_category: parsed.data.category,
    feedback_category_label: feedbackCategoryLabels[parsed.data.category],
    email_masked: email ? maskEmail(email) : null,
    fingerprint_hash: fingerprintHash.slice(0, 16),
    outcome: "success",
  });

  return ok();
}
