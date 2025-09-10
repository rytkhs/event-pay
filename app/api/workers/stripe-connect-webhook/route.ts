/**
 * QStash Webhook Worker for Stripe Connect Events
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Receiver } from "@upstash/qstash";
import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";
import { stripe as sharedStripe } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";

import { ConnectWebhookHandler } from "@features/payments/services/webhook/connect-webhook-handler";

const getQstashReceiver = () => {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QStash signing keys are required");
  }
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
};

export async function POST(request: NextRequest) {
  const start = Date.now();
  const corr = `qstash_connect_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    logger.info("Connect QStash worker request received", {
      tag: "connect-qstash",
      correlation_id: corr,
    });

    const signature = request.headers.get("Upstash-Signature");
    const deliveryId = request.headers.get("Upstash-Delivery-Id");
    // const url = request.nextUrl.toString();
    const url = `${process.env.APP_BASE_URL || process.env.NEXTAUTH_URL}/api/workers/stripe-connect-webhook`;
    const rawBody = await request.text();

    if (!signature) {
      logger.warn("Missing QStash signature (connect)", {
        tag: "connect-qstash",
        correlation_id: corr,
        ip: getClientIP(request),
      });
      return new NextResponse("Missing signature", { status: 401 });
    }

    const receiver = getQstashReceiver();
    const isValid = await receiver.verify({ signature, body: rawBody, url });
    if (!isValid) {
      logger.warn("Invalid QStash signature (connect)", {
        tag: "connect-qstash",
        correlation_id: corr,
        ip: getClientIP(request),
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    let parsed: { eventId: string; type?: string; account?: string | null };
    try {
      parsed = JSON.parse(rawBody);
    } catch (e) {
      return new NextResponse("Invalid JSON body", { status: 400 });
    }

    const { eventId, account } = parsed;
    if (!eventId) {
      return new NextResponse("Missing eventId", { status: 400 });
    }

    const retrieveOptions: { stripeAccount?: string } = {};
    if (account) retrieveOptions.stripeAccount = account;

    const event = await sharedStripe.events.retrieve(eventId, retrieveOptions);

    // 既存Connectハンドラに委譲
    const handler = await ConnectWebhookHandler.create();
    switch (event.type) {
      case "account.updated": {
        const accountObj = event.data.object as Stripe.Account;
        await handler.handleAccountUpdated(accountObj);
        break;
      }
      case "account.application.deauthorized": {
        const applicationObj = event.data.object as Stripe.Application;
        await handler.handleAccountApplicationDeauthorized(applicationObj, (event as any).account);
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        await handler.handlePayoutPaid(payout);
        break;
      }
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        await handler.handlePayoutFailed(payout);
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

    const ms = Date.now() - start;
    logger.info("Connect QStash worker processed", {
      tag: "connect-qstash",
      correlation_id: corr,
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
      error_message: error instanceof Error ? error.message : String(error),
      ms,
    });
    return new NextResponse("Internal server error", { status: 500 });
  }
}
