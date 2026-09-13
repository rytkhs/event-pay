import { http, HttpResponse } from "msw";
import { describe, expect } from "vitest";

import { StripeConnectErrorHandler, StripeConnectService } from "@features/stripe-connect/server";

import { test as authTest } from "../../fixtures/auth";
import { externalHttpFixture, type ExternalHttpFixtures } from "../../fixtures/external-http";

const test = authTest.extend<ExternalHttpFixtures>(externalHttpFixture);

const CREATED_ACCOUNT_PATH = "https://api.stripe.com/v1/accounts";

function stripeAccount(accountId: string) {
  return {
    id: accountId,
    object: "account",
    country: "JP",
    default_currency: "jpy",
    payouts_enabled: false,
    requirements: {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
  };
}

function manualPayoutSchedule() {
  return {
    object: "balance_settings",
    payments: { payouts: { schedule: { interval: "manual" } } },
  };
}

describe("Stripe Connect Express Account作成", () => {
  test("test環境でも作成requestへIdempotency-Keyを付与する", async ({
    adminClient,
    externalHttp,
    organizer,
    organizerClient,
  }) => {
    const accountId = "acct_issue592success0001";
    externalHttp.on(
      http.post(CREATED_ACCOUNT_PATH, () => HttpResponse.json(stripeAccount(accountId))),
      http.post("https://api.stripe.com/v1/balance_settings", () =>
        HttpResponse.json(manualPayoutSchedule())
      )
    );

    const service = new StripeConnectService(organizerClient, new StripeConnectErrorHandler());
    const result = await service.createExpressAccount({
      userId: organizer.id,
      email: organizer.email,
      country: "JP",
    });

    expect(result).toEqual({ accountId, status: "unverified" });

    const createRequest = externalHttp
      .requests("stripe")
      .find((request) => request.url.pathname === "/v1/accounts");
    expect(createRequest?.headers["idempotency-key"]).toMatch(/^connect_[0-9a-f-]{36}$/);

    const { data: payoutProfile, error } = await adminClient
      .from("payout_profiles")
      .select("stripe_account_id")
      .eq("owner_user_id", organizer.id)
      .single();
    expect(error).toBeNull();
    expect(payoutProfile?.stripe_account_id).toBe(accountId);
  });

  test("振込スケジュール設定失敗時は作成済みAccountを補償削除する", async ({
    adminClient,
    externalHttp,
    organizer,
    organizerClient,
  }) => {
    const accountId = "acct_issue592schedule0001";
    externalHttp.on(
      http.post(CREATED_ACCOUNT_PATH, () => HttpResponse.json(stripeAccount(accountId))),
      http.post("https://api.stripe.com/v1/balance_settings", () =>
        HttpResponse.json(
          { error: { message: "manual payout schedule failed", type: "api_error" } },
          { status: 500, headers: { "stripe-should-retry": "false" } }
        )
      ),
      http.delete(`https://api.stripe.com/v1/accounts/${accountId}`, () =>
        HttpResponse.json({ id: accountId, object: "account", deleted: true })
      )
    );

    const service = new StripeConnectService(organizerClient, new StripeConnectErrorHandler());
    await expect(
      service.createExpressAccount({
        userId: organizer.id,
        email: organizer.email,
        country: "JP",
      })
    ).rejects.toThrow("振込スケジュールの設定に失敗しました");

    expect(
      externalHttp
        .requests("stripe")
        .some(
          (request) =>
            request.method === "DELETE" && request.url.pathname === `/v1/accounts/${accountId}`
        )
    ).toBe(true);

    const { data } = await adminClient
      .from("payout_profiles")
      .select("id")
      .eq("owner_user_id", organizer.id);
    expect(data).toEqual([]);
  });

  test("DB保存失敗時は作成済みAccountを補償削除する", async ({
    adminClient,
    externalHttp,
    organizerClient,
    otherOrganizer,
  }) => {
    const accountId = "acct_issue592database0001";
    externalHttp.on(
      http.post(CREATED_ACCOUNT_PATH, () => HttpResponse.json(stripeAccount(accountId))),
      http.post("https://api.stripe.com/v1/balance_settings", () =>
        HttpResponse.json(manualPayoutSchedule())
      ),
      http.delete(`https://api.stripe.com/v1/accounts/${accountId}`, () =>
        HttpResponse.json({ id: accountId, object: "account", deleted: true })
      )
    );

    // organizerClientに別ユーザーのowner_user_idを渡し、RLSでINSERTを失敗させる。
    const service = new StripeConnectService(organizerClient, new StripeConnectErrorHandler());
    await expect(
      service.createExpressAccount({
        userId: otherOrganizer.id,
        email: otherOrganizer.email,
        country: "JP",
      })
    ).rejects.toThrow("データベースエラー");

    expect(
      externalHttp
        .requests("stripe")
        .some(
          (request) =>
            request.method === "DELETE" && request.url.pathname === `/v1/accounts/${accountId}`
        )
    ).toBe(true);

    const { data } = await adminClient
      .from("payout_profiles")
      .select("id")
      .eq("owner_user_id", otherOrganizer.id);
    expect(data).toEqual([]);
  });
});
