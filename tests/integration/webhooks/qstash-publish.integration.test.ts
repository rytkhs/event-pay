import { NextRequest } from "next/server";

import { http, HttpResponse } from "msw";
import { describe, expect, vi } from "vitest";

import { getStripe } from "@core/stripe/client";

import { POST as postStripeWebhook } from "@/app/api/webhooks/stripe/route";
import { POST as postStripeConnectWebhook } from "@/app/api/webhooks/stripe-connect/route";

import { test } from "../../fixtures/external-http";

function createSignedWebhookRequest(options: {
  eventId: string;
  eventType: string;
  path: string;
  secret: string;
}) {
  const payload = JSON.stringify({
    id: options.eventId,
    object: "event",
    api_version: null,
    created: 1_789_268_400,
    data: { object: { id: "object_issue593", object: "test_object" } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: options.eventType,
  });
  const signature = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret: options.secret,
  });

  return new NextRequest(`http://localhost${options.path}`, {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
      "x-request-id": `req_${options.eventId}`,
    },
  });
}

type WebhookPublishCase = {
  name: string;
  post: (request: NextRequest) => Promise<Response>;
  path: string;
  secret: string;
  eventId: string;
  eventType: string;
  messageId: string;
  workerPath: string;
};

// 両routeに独立して存在した同期分岐の回帰を、それぞれ検知する。
const webhookPublishCases: WebhookPublishCase[] = [
  {
    name: "決済Webhook",
    post: postStripeWebhook,
    path: "/api/webhooks/stripe",
    secret: "whsec_eventpay_integration_dummy",
    eventId: "evt_issue593_payment",
    eventType: "customer.created",
    messageId: "msg_issue593_payment",
    workerPath: "/api/workers/stripe-webhook",
  },
  {
    name: "Connect Webhook",
    post: postStripeConnectWebhook,
    path: "/api/webhooks/stripe-connect",
    secret: "whsec_eventpay_integration_connect_dummy",
    eventId: "evt_issue593_connect",
    eventType: "account.updated",
    messageId: "msg_issue593_connect",
    workerPath: "/api/workers/stripe-connect-webhook",
  },
];

describe("Stripe Webhook QStash publish", () => {
  test.for(webhookPublishCases)(
    "$nameはtest環境でもQStashへpublishする",
    async (webhook, { externalHttp }) => {
      // 廃止した環境変数がシェルから漏れても挙動を変えないことを保証する。
      vi.stubEnv("SKIP_QSTASH_IN_TEST", "true");
      externalHttp.on(
        http.post("https://qstash.upstash.io/v2/publish/*", () =>
          HttpResponse.json({ messageId: webhook.messageId })
        )
      );

      const response = await webhook.post(
        createSignedWebhookRequest({
          eventId: webhook.eventId,
          eventType: webhook.eventType,
          path: webhook.path,
          secret: webhook.secret,
        })
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("x-qstash-message-id")).toBe(webhook.messageId);

      const [publishRequest] = externalHttp.requests("qstash");
      expect(publishRequest?.headers["upstash-deduplication-id"]).toBe(webhook.eventId);
      expect(publishRequest?.url.pathname).toContain(webhook.workerPath);
      expect(JSON.parse((await publishRequest?.text()) ?? "{}")).toMatchObject({
        event: { id: webhook.eventId, type: webhook.eventType },
      });
    }
  );
});
