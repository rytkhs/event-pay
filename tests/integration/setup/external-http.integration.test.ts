import { Client } from "@upstash/qstash";
import { http, HttpResponse } from "msw";
import { describe, expect } from "vitest";

import { EmailNotificationService } from "@core/notification/email-service";
import { createStripeRequestOptions, generateIdempotencyKey, getStripe } from "@core/stripe/client";

import { test } from "../../fixtures/external-http";
import type { RecordedRequest } from "../../setup/external-http";

/**
 * 外部境界 fake ハーネスのカナリー。
 *
 * `tests/setup/external-http.ts` は MSW と Stripe / QStash / Resend の各 SDK に依存する。
 * SDK や MSW を更新したときは、まずこのファイルを確認する。
 * `next-request-context.integration.test.ts` と同じ位置づけ。
 */

/** 記録が1件だけであることを確かめて、その1件を非nullで返す。 */
function requireSingle(requests: RecordedRequest[]): RecordedRequest {
  expect(requests).toHaveLength(1);

  const [request] = requests;

  if (!request) {
    throw new Error("送信requestが記録されていません");
  }

  return request;
}

describe("外部境界 fake ハーネス", () => {
  test("Stripe SDK の送信requestをheaderとbodyまで観測できる", async ({ externalHttp }) => {
    externalHttp.on(
      http.post("https://api.stripe.com/v1/customers", () =>
        HttpResponse.json({ id: "cus_canary", object: "customer" })
      )
    );

    const idempotencyKey = generateIdempotencyKey("canary");
    const customer = await getStripe().customers.create(
      { email: "canary@example.test" },
      createStripeRequestOptions(idempotencyKey)
    );

    expect(customer.id).toBe("cus_canary");

    const request = requireSingle(externalHttp.requests("stripe"));
    expect(request.method).toBe("POST");
    expect(request.url.pathname).toBe("/v1/customers");
    expect(request.headers.authorization).toMatch(/^Bearer sk_test_/);
    expect(request.headers["idempotency-key"]).toBe(idempotencyKey);
    expect(request.headers["stripe-version"]).toBeDefined();

    const body = new URLSearchParams(await request.text());
    expect(body.get("email")).toBe("canary@example.test");
  });

  test("QStash publishのdeduplication IDをheaderから読める", async ({ externalHttp }) => {
    externalHttp.on(
      http.post("https://qstash.upstash.io/v2/publish/*", () =>
        HttpResponse.json({ messageId: "msg_canary" })
      )
    );

    const qstash = new Client({ token: "qstash_eventpay_integration_dummy" });
    const result = await qstash.publishJSON({
      url: "http://localhost:3000/api/workers/stripe-webhook",
      body: { event: { id: "evt_canary" } },
      deduplicationId: "evt_canary",
      retries: 3,
      delay: 0,
      headers: { "x-source": "canary" },
    });

    expect(result.messageId).toBe("msg_canary");

    const request = requireSingle(externalHttp.requests("qstash"));
    expect(request.headers["upstash-deduplication-id"]).toBe("evt_canary");
    expect(request.headers["upstash-retries"]).toBe("3");
    expect(request.url.pathname).toContain("/v2/publish/");
  });

  test("Resend送信を捕捉でき、ダミーenvでサービスを構築できる", async ({ externalHttp }) => {
    externalHttp.on(
      http.post("https://api.resend.com/emails", () => HttpResponse.json({ id: "email_canary" }))
    );

    // NODE_ENV=test では development スキップが効かず実送信パスに入る。
    // コンストラクタは RESEND_API_KEY / FROM_EMAIL / FROM_NAME / ADMIN_EMAIL が
    // 揃っていないと throw するため、ダミーenvの検証を兼ねる。
    const service = new EmailNotificationService();
    const result = await service.sendEmail({
      to: "guest@example.test",
      template: {
        subject: "カナリー",
        html: "<p>カナリー</p>",
        text: "カナリー",
      },
    });

    expect(result.success).toBe(true);

    const request = requireSingle(externalHttp.requests("resend"));
    expect(request.headers.authorization).toBe("Bearer re_eventpay_integration_dummy");

    const body = JSON.parse(await request.text()) as { to: string[]; subject: string };
    expect(body.to).toEqual(["guest@example.test"]);
    expect(body.subject).toBe("カナリー");
  });

  test("未登録ホストへのリクエストは違反として記録される", async ({ externalHttp }) => {
    const response = await fetch("https://unregistered.example.test/ping");

    expect(response.status).toBe(400);

    const violations = externalHttp.takeViolations();
    expect(violations).toHaveLength(1);
    expect(violations[0]?.url).toBe("https://unregistered.example.test/ping");

    // ドレインしなければ afterEach がテストを失敗させる。
    expect(externalHttp.takeViolations()).toHaveLength(0);
  });

  test("既知ホストでもレスポンス未登録なら違反になり、SDKのリトライを誘発しない", async ({
    externalHttp,
  }) => {
    // レスポンスを登録せずに Stripe を叩く。catch-all が 400 と
    // stripe-should-retry: false を返すため、Stripe SDK の maxNetworkRetries も
    // retryWithIdempotency も再試行しない。ここが 1 でなくなったら、
    // fail-closed が「遅くて読めない失敗」に退化している。
    await expect(getStripe().customers.create({ email: "canary@example.test" })).rejects.toThrow();

    expect(externalHttp.requests("stripe")).toHaveLength(1);

    const violations = externalHttp.takeViolations();
    expect(violations).toHaveLength(1);
    expect(violations[0]?.url).toBe("https://api.stripe.com/v1/customers");
  });

  test("ローカルSupabaseへの実クエリは素通しされ、記録に現れない", async ({
    externalHttp,
    adminClient,
  }) => {
    const { error } = await adminClient.from("communities").select("id").limit(1);

    expect(error).toBeNull();
    expect(externalHttp.requests()).toHaveLength(0);
  });
});
