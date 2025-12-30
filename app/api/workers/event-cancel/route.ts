export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { generateSecureUuid } from "@core/security/crypto";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { logSecurityEvent } from "@core/security/security-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { getClientIP } from "@core/utils/ip-detection";

// 署名検証用Receiver
function getQstashReceiver() {
  const currentKey = getEnv().QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = getEnv().QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QStash signing keys are required");
  }
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
}

interface CancelWorkerBody {
  eventId: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const corr = `qstash_cancel_${generateSecureUuid()}`;

  const cancelLogger = logger.withContext({
    category: "event_management",
    action: "event_cancel_worker",
    actor_type: "webhook",
    correlation_id: corr,
  });
  try {
    // 署名検証
    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/event-cancel`;
    const rawBody = await request.text();

    cancelLogger.info("QStash event-cancel worker received");
    if (!signature) {
      logSecurityEvent({
        type: "QSTASH_SIGNATURE_MISSING",
        severity: "MEDIUM",
        message: "Missing QStash signature (event-cancel)",
        details: { correlation_id: corr, path: "/api/workers/event-cancel" },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/workers/event-cancel",
        detail: "Missing QStash signature",
      });
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({ signature, body: rawBody, url });
    if (!isValid) {
      logSecurityEvent({
        type: "QSTASH_SIGNATURE_INVALID",
        severity: "MEDIUM",
        message: "Invalid QStash signature (event-cancel)",
        details: { correlation_id: corr, path: "/api/workers/event-cancel" },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/workers/event-cancel",
        detail: "Invalid QStash signature",
      });
    }

    // JSON パース
    let parsed: CancelWorkerBody;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/workers/event-cancel",
        detail: "Invalid JSON body",
      });
    }

    const { eventId, message } = parsed;
    if (!eventId) {
      return createProblemResponse("MISSING_PARAMETER", {
        instance: "/api/workers/event-cancel",
        detail: "Missing eventId",
      });
    }

    // 管理者クライアント（Service Role）で参加者メールを取得
    const secureFactory = SecureSupabaseClientFactory.create();
    const admin = await secureFactory.createAuditedAdminClient(
      AdminReason.NOTIFICATION_PROCESSING,
      "event-cancel-worker",
      { additionalInfo: { correlation_id: corr, eventId } }
    );

    const { data: attendees, error } = await admin
      .from("attendances")
      .select("email")
      .eq("event_id", eventId)
      .in("status", ["attending", "maybe"]);

    if (error) {
      cancelLogger.error("Failed to fetch attendees for cancel worker", {
        event_id: eventId,
        error_message: error.message,
        outcome: "failure",
      });
      // 致命的失敗はHTTP 500で返却し、QStashの再試行に委ねる
      return createProblemResponse("DATABASE_ERROR", {
        instance: "/api/workers/event-cancel",
        detail: "Failed to fetch attendees for cancel worker",
      });
    }

    const emails = (attendees || []).map((a) => a.email).filter(Boolean);

    // イベント情報を取得（Slack通知用）
    const { data: eventInfo, error: eventError } = await admin
      .from("events")
      .select("title, created_by")
      .eq("id", eventId)
      .single();

    // Slack通知（管理者向け）
    if (!eventError && eventInfo) {
      try {
        // 主催者名を取得
        const { data: creatorName } = await admin.rpc("get_event_creator_name", {
          p_creator_id: eventInfo.created_by,
        });

        const timestamp = new Date().toISOString();
        const customMessageStr = message ? `\nカスタムメッセージ: ${message}` : "";

        const slackText = `[Event Cancel Alert]
イベント名: ${eventInfo.title}
イベントID: ${eventId}
主催者: ${creatorName || "Unknown User"}
通知対象人数: ${emails.length}人
キャンセル時刻: ${timestamp}${customMessageStr}`;

        const slackResult = await sendSlackText(slackText);

        if (!slackResult.success) {
          cancelLogger.warn("Event cancel Slack notification failed", {
            action: "event_cancel_slack_fail",
            event_id: eventId,
            slack_error: slackResult.error,
            outcome: "failure",
          });
        }
      } catch (error) {
        cancelLogger.error("Event cancel Slack notification exception", {
          action: "event_cancel_slack_exception",
          event_id: eventId,
          error_message: error instanceof Error ? error.message : String(error),
          outcome: "failure",
        });
      }
    }

    // TODO: NotificationService が整備され次第、以下で一斉送信を実装する
    // const notification = new NotificationService(admin);
    // await notification.sendEventCanceledEmails({ eventId, emails, message });

    cancelLogger.info("Event cancel worker processed", {
      event_id: eventId,
      target_count: emails.length,
      note: message ? "custom_message_included" : "no_message",
      outcome: "success",
    });

    return NextResponse.json({ received: true, deliveryId, emails: emails.length });
  } catch (error) {
    cancelLogger.error("Event cancel worker failed", {
      error_message: error instanceof Error ? error.message : String(error),
      outcome: "failure",
    });
    // 失敗時は500 Problem Detailsで返し、QStashのリトライに委ねる
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/workers/event-cancel",
      detail: "Event cancel worker failed",
    });
  } finally {
    const ms = Date.now() - start;
    cancelLogger.debug("Event cancel worker finished", { duration_ms: ms });
  }
}
