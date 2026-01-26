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
import { handleServerError } from "@core/utils/error-handler.server";
import { getClientIP } from "@core/utils/ip-detection";

import { ConnectWebhookHandler } from "@features/stripe-connect/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

const getQstashReceiver = () => {
  const currentKey = getEnv().QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = getEnv().QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QStash signing keys are required");
  }
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
};

export async function POST(request: NextRequest) {
  ensureFeaturesRegistered();
  const start = Date.now();
  const corr = `qstash_connect_${generateSecureUuid()}`;

  const connectLogger = logger.withContext({
    category: "stripe_webhook",
    action: "stripe_connect_webhook_worker",
    actor_type: "webhook",
    correlation_id: corr,
    request_id: corr,
  });

  try {
    connectLogger.info("Connect QStash worker request received");

    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    // const url = request.nextUrl.toString();
    const url = `${getEnv().NEXT_PUBLIC_APP_URL}/api/workers/stripe-connect-webhook`;
    const rawBody = await request.text();

    if (!signature) {
      connectLogger.warn("Missing QStash signature (connect)", {
        ip: getClientIP(request),
        outcome: "failure",
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
      connectLogger.warn("Invalid QStash signature (connect)", {
        ip: getClientIP(request),
        outcome: "failure",
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
      connectLogger.warn("Missing or invalid event in Connect QStash webhook body", {
        has_event: !!event,
        event_id: event?.id,
        event_type: event?.type,
        outcome: "failure",
      });
      return createProblemResponse("INVALID_REQUEST", {
        instance: "/api/workers/stripe-connect-webhook",
        detail: "Missing or invalid event data",
        correlation_id: corr,
      });
    }

    connectLogger.debug("Processing received Connect event", {
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
        connectLogger.info("Connect event ignored (unsupported type)", {
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
      handleServerError("CONNECT_WEBHOOK_UNEXPECTED_ERROR", {
        category: "stripe_webhook",
        action: "stripe_connect_worker_terminal_failure",
        additionalData: {
          delivery_id: deliveryId,
          event_id: event.id,
          type: event.type,
          ms: msTerminal,
          reason: (processingResult as any).reason,
          error: (processingResult as any).error,
          correlation_id: corr,
        },
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
    connectLogger.info("Connect QStash worker processed", {
      delivery_id: deliveryId,
      event_id: event.id,
      type: event.type,
      ms,
      outcome: "success",
    });

    return NextResponse.json({ success: true, eventId: event.id, type: event.type, ms });
  } catch (error) {
    const ms = Date.now() - start;
    handleServerError("CONNECT_WEBHOOK_UNEXPECTED_ERROR", {
      category: "stripe_webhook",
      action: "stripe_connect_worker_error",
      additionalData: {
        error_message: error instanceof Error ? error.message : String(error),
        ms,
        correlation_id: corr,
      },
    });
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/workers/stripe-connect-webhook",
      detail: "Worker failed to process connect event",
      correlation_id: corr,
    });
  }
}
