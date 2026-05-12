import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import type Stripe from "stripe";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getStripe } from "@core/stripe/client";

import { PayoutRequestService } from "@features/stripe-connect/server";

import { expectAppFailure, expectAppSuccess } from "@tests/helpers/assert-result";
import {
  createPayoutContextFixture,
  createPayoutRequestFixture,
  getPayoutRequestById,
  listPayoutRequests,
  type PayoutContextFixture,
  type PayoutRequestFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";
import {
  acquireStripeConnectSharedAccountLock,
} from "@tests/helpers/stripe-connect-shared-account-lock";

const SHARED_STRIPE_ACCOUNT_ID = "acct_1TNaiwEPOXwA4bzb";
const FUNDING_AMOUNT_JPY = 5000;
const BALANCE_SETTLE_TIMEOUT_MS = 30_000;
const BALANCE_SETTLE_POLL_INTERVAL_MS = 1_000;

type PayoutRequestSnapshot = PayoutRequestFixture[];

function uniqueTestId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function currentTestName(): string {
  return expect.getState().currentTestName ?? "";
}

function cardAvailableAmount(balance: Stripe.Balance): number {
  return balance.available
    .filter((entry) => entry.currency === "jpy")
    .reduce((sum, entry) => sum + (entry.source_types?.card ?? 0), 0);
}

async function getSharedAccountCardAvailableAmount(): Promise<number> {
  return cardAvailableAmount(
    await getStripe().balance.retrieve({}, { stripeAccount: SHARED_STRIPE_ACCOUNT_ID })
  );
}

async function waitForSharedAccountCardAvailableBalance(): Promise<number> {
  const deadline = Date.now() + BALANCE_SETTLE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const amount = await getSharedAccountCardAvailableAmount();
    if (amount > 0) {
      return amount;
    }

    await new Promise((resolve) => setTimeout(resolve, BALANCE_SETTLE_POLL_INTERVAL_MS));
  }

  throw new Error("Timed out waiting for shared Stripe account card available balance");
}

async function fundSharedAccountAvailableBalance(): Promise<void> {
  const paymentIntent = await getStripe().paymentIntents.create(
    {
      amount: FUNDING_AMOUNT_JPY,
      currency: "jpy",
      payment_method: "pm_card_bypassPendingInternational",
      payment_method_types: ["card"],
      confirm: true,
      transfer_data: { destination: SHARED_STRIPE_ACCOUNT_ID },
      metadata: {
        test_scope: "payout_request_integration",
        test_run_id: uniqueTestId(),
      },
    },
    { idempotencyKey: `payout_request_fund_${uniqueTestId()}` }
  );

  if (paymentIntent.status !== "succeeded") {
    throw new Error(`Failed to fund shared Stripe account: ${paymentIntent.status}`);
  }

  await waitForSharedAccountCardAvailableBalance();
}

async function drainSharedAccountAvailableBalance(): Promise<void> {
  const amount = await getSharedAccountCardAvailableAmount();
  if (amount <= 0) {
    return;
  }

  await getStripe().payouts.create(
    {
      amount,
      currency: "jpy",
      source_type: "card",
      metadata: {
        test_scope: "payout_request_integration_drain",
        test_run_id: uniqueTestId(),
      },
    },
    {
      stripeAccount: SHARED_STRIPE_ACCOUNT_ID,
      idempotencyKey: `payout_request_drain_${uniqueTestId()}`,
    }
  );
}

async function listSharedStripePayoutIds(): Promise<string[]> {
  const payouts = await getStripe().payouts.list(
    { limit: 20 },
    { stripeAccount: SHARED_STRIPE_ACCOUNT_ID }
  );
  return payouts.data.map((payout) => payout.id);
}

async function createContext(
  options: {
    emailPrefix: string;
    payoutsEnabled?: boolean;
    attachPayoutProfileToCommunity?: boolean;
  } = { emailPrefix: "payout-request-integration" }
): Promise<PayoutContextFixture> {
  await releaseSharedStripeAccountDbRows();
  return createPayoutContextFixture({
    ...options,
    stripeAccountId: SHARED_STRIPE_ACCOUNT_ID,
    collectionReady: true,
  });
}

async function releaseSharedStripeAccountDbRows(): Promise<void> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Releasing shared payout integration Stripe account",
    {
      operationType: "DELETE",
      accessedTables: ["public.communities", "public.payout_profiles", "public.payout_requests"],
    }
  );

  const { data: profiles, error: selectError } = await adminClient
    .from("payout_profiles")
    .select("id")
    .eq("stripe_account_id", SHARED_STRIPE_ACCOUNT_ID);

  if (selectError) {
    throw new Error(`Failed to find shared payout profile rows: ${selectError.message}`);
  }

  const profileIds = profiles?.map((profile) => profile.id) ?? [];
  if (profileIds.length === 0) {
    return;
  }

  const { error: detachError } = await adminClient
    .from("communities")
    .update({ current_payout_profile_id: null })
    .in("current_payout_profile_id", profileIds);

  if (detachError) {
    throw new Error(`Failed to detach shared payout profile rows: ${detachError.message}`);
  }

  const { error: requestDeleteError } = await adminClient
    .from("payout_requests")
    .delete()
    .in("payout_profile_id", profileIds);

  if (requestDeleteError) {
    throw new Error(`Failed to delete shared payout request rows: ${requestDeleteError.message}`);
  }

  const { error: profileDeleteError } = await adminClient
    .from("payout_profiles")
    .delete()
    .in("id", profileIds);

  if (profileDeleteError) {
    throw new Error(`Failed to delete shared payout profile rows: ${profileDeleteError.message}`);
  }
}

describe("PayoutRequestService 統合テスト", () => {
  let releaseSharedAccountLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseSharedAccountLock = await acquireStripeConnectSharedAccountLock(
      "stripe-connect-payout-integration"
    );
  }, 130_000);

  afterAll(async () => {
    await releaseSharedAccountLock?.();
  });

  describe("入金要求の作成", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let payoutRequestsBefore: PayoutRequestSnapshot;
    let stripePayoutIdsBefore: string[];
    let existingRequestForTraceability: PayoutRequestFixture | null;

    beforeEach(async () => {
      existingRequestForTraceability = null;
      ctx = await createContext({ emailPrefix: "payout-create" });
      service = new PayoutRequestService(ctx.adminClient);

      const testName = currentTestName();
      if (testName.includes("available残高が存在する時")) {
        await fundSharedAccountAvailableBalance();
      }
      if (testName.includes("payout_profileが紐付かない時")) {
        await ctx.adminClient
          .from("communities")
          .update({ current_payout_profile_id: null })
          .eq("id", ctx.communityId);
      }
      if (testName.includes("payouts_enabledがfalse")) {
        await ctx.adminClient
          .from("payout_profiles")
          .update({ payouts_enabled: false })
          .eq("id", ctx.payoutProfileId);
      }
      if (testName.includes("available残高が0円")) {
        await drainSharedAccountAvailableBalance();
      }
      if (testName.includes("追跡用カラム")) {
        existingRequestForTraceability = await createPayoutRequestFixture(ctx, {
          status: "pending",
          stripePayoutId: `po_trace_existing_${uniqueTestId()}`,
          idempotencyKey: `payout_trace_existing_${uniqueTestId()}`,
        });
        await fundSharedAccountAvailableBalance();
      }

      payoutRequestsBefore = await listPayoutRequests(ctx);
      stripePayoutIdsBefore = await listSharedStripePayoutIds();
    }, 60000);

    afterEach(async () => {
      await ctx?.cleanup();
    });

    // Service境界から実DB保存とStripe Payout作成まで到達する代表ケースを固定する
    it("現在のコミュニティに入金可能なpayout_profileとavailable残高が存在する時、payout_requestがpendingで保存されStripe Payout IDが保存されること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data!.payoutRequestId);
      const stripePayout = await getStripe().payouts.retrieve(
        success.data!.stripePayoutId,
        {},
        { stripeAccount: SHARED_STRIPE_ACCOUNT_ID }
      );

      expect(success.data).toEqual(
        expect.objectContaining({
          stripeAccountId: SHARED_STRIPE_ACCOUNT_ID,
          amount: expect.any(Number),
          currency: "jpy",
          status: "pending",
        })
      );
      expect(success.data!.amount).toBeGreaterThan(0);
      expect(row).toEqual(
        expect.objectContaining({
          id: success.data!.payoutRequestId,
          payout_profile_id: ctx.payoutProfileId,
          community_id: ctx.communityId,
          requested_by: ctx.user.id,
          stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
          stripe_payout_id: success.data!.stripePayoutId,
          amount: success.data!.amount,
          currency: "jpy",
          status: "pending",
        })
      );
      expect(stripePayout.id).toBe(success.data!.stripePayoutId);
      expect(stripePayout.amount).toBe(success.data!.amount);
    }, 60000);

    // アプリ内入金は現在のコミュニティの受取先に限定することを固定する
    it("現在のコミュニティにpayout_profileが紐付かない時、payout_requestもStripe Payoutも作成されないこと", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
      expect(await listSharedStripePayoutIds()).toEqual(stripePayoutIdsBefore);
    });

    // 入金実行可否はオンライン集金可否ではなくpayouts_enabledで判定する
    it("payouts_enabledがfalseの時、payout_requestもStripe Payoutも作成されないこと", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
      expect(await listSharedStripePayoutIds()).toEqual(stripePayoutIdsBefore);
    });

    // available残高0円で空の入金を作らないことを固定する
    it("available残高が0円の時、payout_requestもStripe Payoutも作成されないこと", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
      expect(await listSharedStripePayoutIds()).toEqual(stripePayoutIdsBefore);
    });

    // 追跡可能性はDB保存を統合テストで固定し、Stripe呼び出し引数の詳細はunitで固定する
    it("入金要求に成功した時、payout_requestに追跡用カラムと一意なidempotency_keyが保存されること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data!.payoutRequestId);
      expect(row).toEqual(
        expect.objectContaining({
          payout_profile_id: ctx.payoutProfileId,
          community_id: ctx.communityId,
          requested_by: ctx.user.id,
          stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
          stripe_payout_id: success.data!.stripePayoutId,
          amount: success.data!.amount,
          currency: "jpy",
          status: "pending",
          idempotency_key: expect.stringMatching(/^payout_/),
        })
      );
      expect(row?.idempotency_key).not.toBe(existingRequestForTraceability?.idempotency_key);
    }, 60000);
  });

  describe("DB制約", () => {
    let ctx: PayoutContextFixture;
    let existingRequest: PayoutRequestFixture;

    beforeEach(async () => {
      ctx = await createContext({ emailPrefix: "payout-db-constraint" });
      existingRequest = await createPayoutRequestFixture(ctx, {
        status: "pending",
        stripePayoutId: `po_unique_${uniqueTestId()}`,
        idempotencyKey: `payout_unique_${uniqueTestId()}`,
      });
    });

    afterEach(async () => {
      await ctx?.cleanup();
    });

    // Stripe webhook復旧と二重登録防止のためDB制約を固定する
    it("同じstripe_payout_idのpayout_requestを複数保存できないこと", async () => {
      const before = await listPayoutRequests(ctx);

      const { error } = await ctx.adminClient.from("payout_requests").insert({
        payout_profile_id: ctx.payoutProfileId,
        community_id: ctx.communityId,
        requested_by: ctx.user.id,
        stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
        stripe_payout_id: existingRequest.stripe_payout_id,
        amount: 1000,
        currency: "jpy",
        status: "pending",
        idempotency_key: `payout_duplicate_stripe_id_${uniqueTestId()}`,
      });

      expect(error).toEqual(expect.objectContaining({ code: "23505" }));
      expect(await listPayoutRequests(ctx)).toEqual(before);
    });

    // Stripe冪等性キーの再利用事故をDB制約で防ぐ
    it("同じidempotency_keyのpayout_requestを複数保存できないこと", async () => {
      const before = await listPayoutRequests(ctx);

      const { error } = await ctx.adminClient.from("payout_requests").insert({
        payout_profile_id: ctx.payoutProfileId,
        community_id: ctx.communityId,
        requested_by: ctx.user.id,
        stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
        stripe_payout_id: `po_duplicate_key_${uniqueTestId()}`,
        amount: 1000,
        currency: "jpy",
        status: "pending",
        idempotency_key: existingRequest.idempotency_key,
      });

      expect(error).toEqual(expect.objectContaining({ code: "23505" }));
      expect(await listPayoutRequests(ctx)).toEqual(before);
    });
  });

  describe("二重実行と再実行", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let payoutRequestsBefore: PayoutRequestSnapshot;

    beforeEach(async () => {
      ctx = await createContext({ emailPrefix: "payout-rerun" });
      service = new PayoutRequestService(ctx.adminClient);

      const testName = currentTestName();
      if (testName.includes("requestingのpayout_request")) {
        await createPayoutRequestFixture(ctx, { status: "requesting" });
      }
      if (testName.includes("pendingのpayout_request")) {
        await createPayoutRequestFixture(ctx, {
          status: "pending",
          stripePayoutId: `po_created_old_${uniqueTestId()}`,
        });
        await fundSharedAccountAvailableBalance();
      }
      if (testName.includes("同時実行")) {
        await fundSharedAccountAvailableBalance();
      }

      payoutRequestsBefore = await listPayoutRequests(ctx);
    }, 60000);

    afterEach(async () => {
      await ctx?.cleanup();
    });

    // 未完了リクエストの二重作成をサービス境界で防ぐことを固定する
    it("同じpayout_profileにrequestingのpayout_requestが存在する時、新しい入金要求は作成されないこと", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
    });

    // Stripe作成済みリクエストは履歴扱いにし、freshなavailable残高があれば次の入金を許可する代表ケースを固定する
    it("同じpayout_profileにpendingのpayout_requestのみが存在する時、新しい入金要求を作成できること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const after = await listPayoutRequests(ctx);
      expect(after).toHaveLength(payoutRequestsBefore.length + 1);
      expect(after).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: payoutRequestsBefore[0]?.id, status: "pending" }),
          expect.objectContaining({
            id: success.data!.payoutRequestId,
            status: "pending",
            stripe_payout_id: success.data!.stripePayoutId,
          }),
        ])
      );
    }, 60000);

    // active requestはrequesting / creation_unknownのみとし、同時クリックを単一に収束させる
    it("同じpayout_profileへの入金要求が同時実行された時、activeなpayout_requestは1件だけ作成されること", async () => {
      const results = await Promise.all([
        service.requestPayout({ userId: ctx.user.id, communityId: ctx.communityId }),
        service.requestPayout({ userId: ctx.user.id, communityId: ctx.communityId }),
      ]);

      const after = await listPayoutRequests(ctx);
      const successResults = results.filter((result) => result.success);
      const activeRequests = after.filter((row) =>
        ["requesting", "creation_unknown"].includes(row.status)
      );
      expect(successResults).toHaveLength(1);
      expect(after).toHaveLength(1);
      expect(activeRequests).toHaveLength(0);
      expect(after[0]).toEqual(
        expect.objectContaining({
          status: "pending",
          stripe_payout_id: expect.stringMatching(/^po_/),
        })
      );
    }, 60000);
  });
});
