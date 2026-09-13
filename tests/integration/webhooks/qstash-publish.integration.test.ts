import { NextRequest } from "next/server";

import { http, HttpResponse } from "msw";
import { describe, expect, vi } from "vitest";

import { getStripe } from "@core/stripe/client";

import { POST as postStripeWebhook } from "@/app/api/webhooks/stripe/route";
import { POST as postStripeConnectWebhook } from "@/app/api/webhooks/stripe-connect/route";

import { test } from "../../fixtures/external-http";

const STRIPE_WEBHOOK_SECRET = "whsec_eventpay_integration_dummy";
const STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_eventpay_integration_connect_dummy";

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

describe("Stripe Webhook QStash publish", () => {
  test("決済Webhookはtest環境でもQStashへpublishする", async ({ externalHttp }) => {
    // 廃止した環境変数がシェルから漏れても挙動を変えないことを保証する。
    vi.stubEnv("SKIP_QSTASH_IN_TEST", "true");
    const eventId = "evt_issue593_payment";
    externalHttp.on(
      http.post("https://qstash.upstash.io/v2/publish/*", () =>
        HttpResponse.json({ messageId: "msg_issue593_payment" })
      )
    );

    const response = await postStripeWebhook(
      createSignedWebhookRequest({
        eventId,
        eventType: "customer.created",
        path: "/api/webhooks/stripe",
        secret: STRIPE_WEBHOOK_SECRET,
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("x-qstash-message-id")).toBe("msg_issue593_payment");

    const [publishRequest] = externalHttp.requests("qstash");
    expect(publishRequest?.headers["upstash-deduplication-id"]).toBe(eventId);
    expect(publishRequest?.url.pathname).toContain("/api/workers/stripe-webhook");
    expect(JSON.parse((await publishRequest?.text()) ?? "{}")).toMatchObject({
      event: { id: eventId, type: "customer.created" },
    });
  });

  test("Connect Webhookはtest環境でもQStashへpublishする", async ({ externalHttp }) => {
    // 両routeに独立して存在した同期分岐の回帰を検知する。
    vi.stubEnv("SKIP_QSTASH_IN_TEST", "true");
    const eventId = "evt_issue593_connect";
    externalHttp.on(
      http.post("https://qstash.upstash.io/v2/publish/*", () =>
        HttpResponse.json({ messageId: "msg_issue593_connect" })
      )
    );

    const response = await postStripeConnectWebhook(
      createSignedWebhookRequest({
        eventId,
        eventType: "account.updated",
        path: "/api/webhooks/stripe-connect",
        secret: STRIPE_CONNECT_WEBHOOK_SECRET,
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("x-qstash-message-id")).toBe("msg_issue593_connect");

    const [publishRequest] = externalHttp.requests("qstash");
    expect(publishRequest?.headers["upstash-deduplication-id"]).toBe(eventId);
    expect(publishRequest?.url.pathname).toContain("/api/workers/stripe-connect-webhook");
    expect(JSON.parse((await publishRequest?.text()) ?? "{}")).toMatchObject({
      event: { id: eventId, type: "account.updated" },
    });
  });
});
