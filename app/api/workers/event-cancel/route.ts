export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";

import { logger } from "@core/logging/app-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getClientIP } from "@core/utils/ip-detection";

// 署名検証用Receiver
function getQstashReceiver() {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
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
  const corr = `qstash_cancel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    logger.info("QStash event-cancel worker received", {
      tag: "event-cancel-worker",
      correlation_id: corr,
    });

    // 署名検証
    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    const url = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/event-cancel`;
    const rawBody = await request.text();

    if (!signature) {
      logger.warn("Missing QStash signature (event-cancel)", {
        tag: "event-cancel-security",
        correlation_id: corr,
        ip: getClientIP(request),
      });
      return new NextResponse("Missing signature", { status: 401 });
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({ signature, body: rawBody, url });
    if (!isValid) {
      logger.warn("Invalid QStash signature (event-cancel)", {
        tag: "event-cancel-security",
        correlation_id: corr,
        ip: getClientIP(request),
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    // JSON パース
    let parsed: CancelWorkerBody;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return new NextResponse("Invalid JSON body", { status: 400 });
    }

    const { eventId, message } = parsed;
    if (!eventId) {
      return new NextResponse("Missing eventId", { status: 400 });
    }

    // 管理者クライアント（Service Role）で参加者メールを取得
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const admin = await secureFactory.createAuditedAdminClient(
      AdminReason.EVENT_MANAGEMENT,
      "event-cancel-worker",
      { additionalInfo: { correlation_id: corr, eventId } }
    );

    const { data: attendees, error } = await admin
      .from("attendances")
      .select("email")
      .eq("event_id", eventId)
      .in("status", ["attending", "maybe"]);

    if (error) {
      logger.error("Failed to fetch attendees for cancel worker", {
        tag: "event-cancel-worker",
        correlation_id: corr,
        event_id: eventId,
        error_message: error.message,
      });
      // DB失敗でも200返してQStashの無限リトライを避ける（要件: ベストエフォート）
      return NextResponse.json({ received: true, deliveryId, attendees: 0 });
    }

    const emails = (attendees || []).map((a) => a.email).filter(Boolean);

    // TODO: NotificationService が整備され次第、以下で一斉送信を実装する
    // const notification = new NotificationService(admin);
    // await notification.sendEventCanceledEmails({ eventId, emails, message });

    logger.info("Event cancel worker processed", {
      tag: "event-cancel-worker",
      correlation_id: corr,
      event_id: eventId,
      target_count: emails.length,
      note: message ? "custom_message_included" : "no_message",
    });

    return NextResponse.json({ received: true, deliveryId, emails: emails.length });
  } catch (error) {
    logger.error("Event cancel worker failed", {
      tag: "event-cancel-worker",
      error_message: error instanceof Error ? error.message : String(error),
    });
    // 失敗時も500で返し、QStashのリトライに委ねる
    return new NextResponse("Internal Server Error", { status: 500 });
  } finally {
    const ms = Date.now() - start;
    logger.debug("Event cancel worker finished", { tag: "event-cancel-worker", duration_ms: ms });
  }
}
