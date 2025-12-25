/**
 * QStash Webhook Worker for Stripe Connect Events
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";
import Stripe from "stripe";

import { createProblemResponse } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { generateSecureUuid } from "@core/security/crypto";
import { getEnv } from "@core/utils/cloudflare-env";
import { getClientIP } from "@core/utils/ip-detection";

import "@/app/_init/feature-registrations";
import { ConnectWebhookHandler } from "@features/payments/services/webhook/connect-webhook-handler";

const getQstashReceiver = () => {
  const currentKey = getEnv().QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = getEnv().QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QStash signing keys are required");
  }
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
};

export async function POST(request: NextRequest) {
  const start = Date.now();
  const corr = `qstash_connect_${generateSecureUuid()}`;

  try {
    logger.info("Connect QStash worker request received", {
      tag: "connect-qstash",
      correlation_id: corr,
      request_id: corr,
    });

    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    // const url = request.nextUrl.toString();
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-connect-webhook`;
    const rawBody = await request.text();

    if (!signature) {
      logger.warn("Missing QStash signature (connect)", {
        tag: "connect-qstash",
        correlation_id: corr,
        request_id: corr,
        ip: getClientIP(request),
      });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/workers/stripe-connect-webhook",
        detail: "Missing QStash signature",
        correlation_id: corr,
      });
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({ signature, body: rawBody, url });
    if (!isValid) {
      logger.warn("Invalid QStash signature (connect)", {
        tag: "connect-qstash",
        correlation_id: corr,
        request_id: corr,
        ip: getClientIP(request),
      });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/workers/stripe-connect-webhook",
        detail: "Invalid QStash signature",
        correlation_id: corr,
      });
    }

    let parsed: { event: Stripe.Event };
    try {
      parsed = JSON.parse(rawBody);
    } catch (e) {
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/workers/stripe-connect-webhook",
        detail: "Invalid JSON body",
        correlation_id: corr,
      });
    }

    const { event } = parsed;
    if (!event?.id || !event?.type) {
      logger.warn("Missing or invalid event in Connect QStash webhook body", {
        tag: "connect-qstash",
        correlation_id: corr,
        has_event: !!event,
        event_id: event?.id,
        event_type: event?.type,
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/workers/stripe-connect-webhook",
        detail: "Missing or invalid event data",
        correlation_id: corr,
      });
    }

    logger.debug("Processing received Connect event", {
      tag: "connect-qstash",
      correlation_id: corr,
      request_id: corr,
      event_id: event.id,
      event_type: event.type,
    });

    // 既存Connectハンドラに委譲
    const handler = await ConnectWebhookHandler.create();
    let processingResult: unknown = { success: true };
    switch (event.type) {
      case "account.updated": {
        const accountObj = event.data.object as Stripe.Account;
        processingResult = await handler.handleAccountUpdated(accountObj);
        break;
      }
      case "account.application.deauthorized": {
        const applicationObj = event.data.object as Stripe.Application;
        processingResult = await handler.handleAccountApplicationDeauthorized(
          applicationObj,
          (event as any).account
        );
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        processingResult = await handler.handlePayoutPaid(payout);
        break;
      }
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        processingResult = await handler.handlePayoutFailed(payout);
        break;
      }
      default: {
        logger.info("Connect event ignored (unsupported type)", {
          tag: "connect-qstash",
          type: event.type,
          event_id: event.id,
        });
      }
    }

    // ハンドラが致命（terminal）失敗を返したらHTTP 500を返す
    if (
      processingResult &&
      typeof processingResult === "object" &&
      (processingResult as any).success === false &&
      (processingResult as any).terminal === true
    ) {
      const msTerminal = Date.now() - start;
      logger.error("Connect QStash worker terminal failure", {
        tag: "connect-qstash",
        correlation_id: corr,
        request_id: corr,
        delivery_id: deliveryId,
        event_id: event.id,
        type: event.type,
        ms: msTerminal,
        reason: (processingResult as any).reason,
        error: (processingResult as any).error,
      });
      return createProblemResponse("INTERNAL_ERROR", {
        instance: "/api/workers/stripe-connect-webhook",
        detail:
          (processingResult as any).error ||
          "Worker failed with terminal error. QStash should retry.",
        correlation_id: corr,
      });
    }

    const ms = Date.now() - start;
    logger.info("Connect QStash worker processed", {
      tag: "connect-qstash",
      correlation_id: corr,
      request_id: corr,
      delivery_id: deliveryId,
      event_id: event.id,
      type: event.type,
      ms,
    });

    return NextResponse.json({ success: true, eventId: event.id, type: event.type, ms });
  } catch (error) {
    const ms = Date.now() - start;
    logger.error("Connect QStash worker error", {
      tag: "connect-qstash",
      correlation_id: corr,
      request_id: corr,
      error_message: error instanceof Error ? error.message : String(error),
      ms,
    });
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/workers/stripe-connect-webhook",
      detail: "Worker failed to process connect event",
      correlation_id: corr,
    });
  }
}
