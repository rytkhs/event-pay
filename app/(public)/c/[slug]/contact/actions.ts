"use server";

import { headers } from "next/headers";

import { InputSanitizer } from "@core/auth-security";
import { ok, type ActionResult, toActionResultFromAppResult, zodFail, fail } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildEmailIdempotencyKey } from "@core/notification/idempotency";
import { sendSlackText } from "@core/notification/slack";
import { buildCommunityContactNoticeTemplate } from "@core/notification/templates";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { hmacSha256Hex } from "@core/rate-limit/hash";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJst, formatDateToJstYmd } from "@core/utils/timezone";
import {
  CommunityContactInputSchema,
  type CommunityContactInput,
} from "@core/validation/community-contact";

import { createCommunityContact } from "@features/communities/server";

function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 1)}${"*".repeat(local.length - 1)}@${domain}`;
}

async function notifyCommunityOwner(params: {
  communityId: string;
  communityName: string;
  senderEmail: string;
  senderName: string;
  messageExcerpt: string;
  fingerprintHash: string;
  dayJst: string;
}) {
  try {
    const admin = await createAuditedAdminClient(
      AdminReason.NOTIFICATION_PROCESSING,
      "Sending community contact owner notification",
      {
        operationType: "SELECT",
        accessedTables: ["public.communities", "public.users"],
        additionalInfo: {
          communityId: params.communityId,
        },
      }
    );

    const { data: community, error: communityError } = await admin
      .from("communities")
      .select("created_by")
      .eq("id", params.communityId)
      .maybeSingle();

    if (communityError || !community?.created_by) {
      logger.warn("Community contact owner lookup failed", {
        category: "email",
        action: "community_contact_owner_lookup_failed",
        actor_type: "system",
        community_id: params.communityId,
        outcome: "failure",
      });
      return;
    }

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(
      community.created_by
    );

    const ownerEmail = authData.user?.email;
    if (authError || !ownerEmail) {
      logger.warn("Community contact owner email missing", {
        category: "email",
        action: "community_contact_owner_email_missing",
        actor_type: "system",
        community_id: params.communityId,
        user_id: community.created_by,
        outcome: "failure",
      });
      return;
    }

    const { EmailNotificationService } = await import("@core/notification/email-service");
    const emailService = new EmailNotificationService();
    const emailResult = await emailService.sendEmail({
      to: ownerEmail,
      template: buildCommunityContactNoticeTemplate({
        communityName: params.communityName,
        senderName: params.senderName,
        senderEmail: params.senderEmail,
        messageExcerpt: params.messageExcerpt,
        receivedAt: new Date(),
      }),
      idempotencyKey: buildEmailIdempotencyKey({
        scope: "community-contact-owner-notice",
        parts: [params.communityId, params.fingerprintHash, params.dayJst],
      }),
    });

    if (!emailResult.success) {
      logger.warn("Community contact owner email failed", {
        category: "email",
        action: "community_contact_owner_email_failed",
        actor_type: "system",
        community_id: params.communityId,
        user_id: community.created_by,
        error_message: emailResult.error.message,
        error_code: emailResult.error.code,
        retryable: emailResult.error.retryable,
        outcome: "failure",
      });
    }

    if (process.env.SLACK_CONTACT_WEBHOOK_URL) {
      const jstStr = formatUtcToJst(new Date(), "yyyy-MM-dd HH:mm 'JST'");
      const slackText = `[CommunityContact] ${params.communityName}\n${params.senderName} <${params.senderEmail}>\n受信: ${jstStr}\n\n${params.messageExcerpt}`;
      const slackResult = await sendSlackText(slackText);

      if (!slackResult.success) {
        logger.warn("Community contact Slack notification failed", {
          category: "system",
          action: "community_contact_slack_failed",
          actor_type: "system",
          community_id: params.communityId,
          error_message: slackResult.error.message,
          error_code: slackResult.error.code,
          retryable: slackResult.error.retryable,
          outcome: "failure",
        });
      }
    }
  } catch (error) {
    handleServerError(error, {
      category: "email",
      action: "community_contact_owner_notification_exception",
      additionalData: {
        community_id: params.communityId,
      },
    });
  }
}

export async function submitCommunityContact(
  communitySlug: string,
  input: CommunityContactInput
): Promise<ActionResult<void>> {
  const parsed = CommunityContactInputSchema.safeParse(input);
  if (!parsed.success) {
    return zodFail(parsed.error);
  }

  const h = await headers();
  const ip = getClientIPFromHeaders(h) ?? undefined;

  const rateLimitKey = buildKey({ scope: "community.contact.submit", ip });
  const rateLimitKeys = Array.isArray(rateLimitKey) ? rateLimitKey : [rateLimitKey];
  const rl = await enforceRateLimit({
    keys: rateLimitKeys,
    policy: POLICIES["community.contact.submit"],
  });

  if (!rl.allowed) {
    const retryAfterSec =
      rl.retryAfter ?? Math.ceil(POLICIES["community.contact.submit"].blockMs / 1000);
    logger.warn("Community contact form rate limited", {
      category: "security",
      action: "community_contact_rate_limited",
      actor_type: "anonymous",
      ip_masked: ip ? `${ip.slice(0, 8)}...` : "unknown",
      community_slug: communitySlug,
      retry_after: retryAfterSec,
      outcome: "failure",
    });

    return fail("RATE_LIMITED", {
      userMessage: "リクエスト回数の上限に達しました。しばらく待ってから再試行してください",
      retryable: true,
      details: { retryAfterSec },
    });
  }

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

  const nameSanitized = sanitizeForEventPay(parsed.data.name).trim();
  const messageSanitized = sanitizeForEventPay(parsed.data.message);
  const normalizedMessage = messageSanitized.trim().replace(/\s+/g, " ");
  const dayJst = formatDateToJstYmd(new Date());
  const fingerprintHash = hmacSha256Hex(`${email}|${normalizedMessage}|${dayJst}`);
  const userAgent = h.get("user-agent") ?? null;
  const ipHash = process.env.RL_HMAC_SECRET && ip ? hmacSha256Hex(ip) : null;

  const supabase = await createServerActionSupabaseClient();
  const createResult = await createCommunityContact(supabase, {
    communitySlug,
    name: nameSanitized,
    email,
    message: normalizedMessage,
    fingerprintHash,
    userAgent,
    ipHash,
  });

  if (!createResult.success) {
    logger.warn("Community contact create failed", {
      category: "system",
      action: "community_contact_create_failed",
      actor_type: "anonymous",
      community_slug: communitySlug,
      email_masked: maskEmail(email),
      error_code: createResult.error.code,
      outcome: "failure",
    });

    return toActionResultFromAppResult(createResult);
  }

  const createdContact = createResult.data;
  if (!createdContact) {
    return fail("INTERNAL_ERROR", {
      userMessage: "お問い合わせの送信に失敗しました。しばらく待ってから再度お試しください。",
      retryable: true,
    });
  }

  logger.info("Community contact submitted successfully", {
    category: "system",
    action: "community_contact_created",
    actor_type: "anonymous",
    community_id: createdContact.communityId,
    community_slug: communitySlug,
    email_masked: maskEmail(email),
    fingerprint_hash: fingerprintHash.slice(0, 16),
    outcome: "success",
  });

  waitUntil(
    notifyCommunityOwner({
      communityId: createdContact.communityId,
      communityName: createdContact.communityName,
      senderEmail: email,
      senderName: nameSanitized,
      messageExcerpt: normalizedMessage.slice(0, 500),
      fingerprintHash,
      dayJst,
    })
  );

  return ok(undefined);
}
