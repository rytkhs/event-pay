import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import type Stripe from "stripe";

import { FeeConfigService } from "@features/payments/services/fee-config/service";
import { PayoutRequestService } from "@features/stripe-connect/server";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getStripe } from "@core/stripe/client";

import { expectAppFailure, expectAppSuccess } from "@tests/helpers/assert-result";
import {
  buildPayout,
  createPayoutContextFixture,
  getPayoutRequestById,
  listPayoutRequests,
  type PayoutContextFixture,
  type PayoutRequestFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";
import { acquireStripeConnectSharedAccountLock } from "@tests/helpers/stripe-connect-shared-account-lock";

const SHARED_STRIPE_ACCOUNT_ID = "acct_1TNaiwEPOXwA4bzb";
const FUNDING_AMOUNT_JPY = 5000;
const PAYOUT_REQUEST_FEE_AMOUNT = 260;
const MIN_PAYOUT_AMOUNT = 1;
const BALANCE_SETTLE_TIMEOUT_MS = 30_000;
const BALANCE_SETTLE_POLL_INTERVAL_MS = 1_000;

type FeeConfigSnapshot = {
  payout_request_fee_amount: number;
  min_payout_amount: number;
};

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
    if (amount > PAYOUT_REQUEST_FEE_AMOUNT) {
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
        test_scope: "payout_request_system_fee_integration",
        test_run_id: uniqueTestId(),
      },
    },
    { idempotencyKey: `payout_request_system_fee_fund_${uniqueTestId()}` }
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
        test_scope: "payout_request_system_fee_drain",
        test_run_id: uniqueTestId(),
      },
    },
    {
      stripeAccount: SHARED_STRIPE_ACCOUNT_ID,
      idempotencyKey: `payout_request_system_fee_drain_${uniqueTestId()}`,
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

async function listPayoutSystemFeeChargeIds(): Promise<string[]> {
  const charges = await getStripe().charges.list({ limit: 20 });
  return charges.data
    .filter((charge) => charge.metadata?.purpose === "payout_request_system_fee")
    .map((charge) => charge.id);
}

async function readFeeConfig(ctx: PayoutContextFixture): Promise<FeeConfigSnapshot> {
  const { data, error } = await ctx.adminClient
    .from("fee_config")
    .select("payout_request_fee_amount, min_payout_amount")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to read fee_config fixture: ${error?.message}`);
  }

  return data;
}

async function updateFeeConfig(
  ctx: PayoutContextFixture,
  values: Partial<FeeConfigSnapshot>
): Promise<void> {
  const { error } = await ctx.adminClient.from("fee_config").update(values).neq("id", 0);

  if (error) {
    throw new Error(`Failed to update fee_config fixture: ${error.message}`);
  }

  new FeeConfigService(ctx.adminClient).invalidateCache();
}

async function releaseSharedStripeAccountDbRows(): Promise<void> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Releasing shared payout system fee integration Stripe account",
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

async function createSharedStripeContext(
  emailPrefix: string
): Promise<{
  ctx: PayoutContextFixture;
  service: PayoutRequestService;
  originalFeeConfig: FeeConfigSnapshot;
}> {
  await releaseSharedStripeAccountDbRows();
  const ctx = await createPayoutContextFixture({
    emailPrefix,
    stripeAccountId: SHARED_STRIPE_ACCOUNT_ID,
    collectionReady: true,
    payoutsEnabled: true,
  });
  const originalFeeConfig = await readFeeConfig(ctx);
  await updateFeeConfig(ctx, {
    payout_request_fee_amount: PAYOUT_REQUEST_FEE_AMOUNT,
    min_payout_amount: MIN_PAYOUT_AMOUNT,
  });

  return {
    ctx,
    service: new PayoutRequestService(ctx.adminClient),
    originalFeeConfig,
  };
}

async function cleanupContext(
  ctx: PayoutContextFixture | undefined,
  originalFeeConfig: FeeConfigSnapshot | undefined
): Promise<void> {
  if (ctx && originalFeeConfig) {
    await updateFeeConfig(ctx, originalFeeConfig);
  }
  await ctx?.cleanup();
}

describe("PayoutRequestService payout手数料", () => {
  let releaseSharedAccountLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseSharedAccountLock = await acquireStripeConnectSharedAccountLock(
      "stripe-connect-payout-system-fee-integration"
    );
  }, 130_000);

  afterAll(async () => {
    await releaseSharedAccountLock?.();
  });

  describe("実Stripe資金フロー", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;
    let createdRequest: PayoutRequestFixture | null;

    beforeEach(async () => {
      createdRequest = null;
      const fixture = await createSharedStripeContext("payout-system-fee-flow");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;

      await drainSharedAccountAvailableBalance();
      await fundSharedAccountAvailableBalance();

      if (currentTestName().includes("Payout webhook")) {
        const result = await service.requestPayout({
          userId: ctx.user.id,
          communityId: ctx.communityId,
        });
        const success = expectAppSuccess(result);
        const row = await getPayoutRequestById(ctx, success.data!.payoutRequestId);

        if (!row) {
          throw new Error("Created payout_request row was not found");
        }

        createdRequest = row;
      }
    }, 90_000);

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 実際のStripe Test環境で、Account DebitとPayoutが同一requestに紐づき金額・追跡情報が保存されることを確認する
    it("connected accountにavailable残高が存在する時、Account Debitでsystem_fee_amountをplatformへ回収し、残額のPayoutを作成し、DBスナップショットとStripe object IDを保存すること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data!.payoutRequestId);
      if (!row) {
        throw new Error("Created payout_request row was not found");
      }
      const stripePayout = await getStripe().payouts.retrieve(
        row.stripe_payout_id!,
        {},
        { stripeAccount: SHARED_STRIPE_ACCOUNT_ID }
      );
      const systemFeeCharge = await getStripe().charges.retrieve(
        row.stripe_account_debit_payment_id!
      );

      expect(success.data).toEqual(
        expect.objectContaining({
          payoutRequestId: row.id,
          stripePayoutId: row.stripe_payout_id,
          stripeAccountId: SHARED_STRIPE_ACCOUNT_ID,
          amount: row.amount,
          grossAmount: row.gross_amount,
          systemFeeAmount: PAYOUT_REQUEST_FEE_AMOUNT,
          systemFeeState: "succeeded",
          currency: "jpy",
          status: row.status,
        })
      );
      expect(row).toEqual(
        expect.objectContaining({
          payout_profile_id: ctx.payoutProfileId,
          community_id: ctx.communityId,
          requested_by: ctx.user.id,
          stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
          amount: row.gross_amount - PAYOUT_REQUEST_FEE_AMOUNT,
          currency: "jpy",
          status: expect.stringMatching(/^(pending|in_transit|paid)$/),
          gross_amount: expect.any(Number),
          system_fee_amount: PAYOUT_REQUEST_FEE_AMOUNT,
          system_fee_state: "succeeded",
          system_fee_idempotency_key: expect.stringMatching(/^payout_fee_/),
          stripe_payout_id: expect.stringMatching(/^po_/),
          stripe_account_debit_transfer_id: expect.stringMatching(/^tr_/),
          stripe_account_debit_payment_id: expect.any(String),
          system_fee_failure_code: null,
          system_fee_failure_message: null,
        })
      );
      expect(row.gross_amount).toBeGreaterThan(PAYOUT_REQUEST_FEE_AMOUNT);
      expect(stripePayout.id).toBe(row.stripe_payout_id);
      expect(stripePayout.amount).toBe(row.amount);
      expect(stripePayout.metadata?.payout_request_id).toBe(row.id);
      expect(systemFeeCharge.id).toBe(row.stripe_account_debit_payment_id);
      expect(systemFeeCharge.amount).toBe(PAYOUT_REQUEST_FEE_AMOUNT);
      expect(systemFeeCharge.metadata).toEqual(
        expect.objectContaining({
          payout_request_id: row.id,
          payout_profile_id: ctx.payoutProfileId,
          community_id: ctx.communityId,
          requested_by: ctx.user.id,
          purpose: "payout_request_system_fee",
        })
      );
    }, 60_000);

    // Payout webhook同期が既存のPayout由来フィールドを更新しつつ、Account Debit追跡情報を壊さないことを確認する
    it("Payout webhookを受信した時、Payout由来フィールドは更新されsystem_fee_stateとAccount Debit追跡フィールドは維持されること", async () => {
      if (!createdRequest) {
        throw new Error("Payout webhook test fixture was not created");
      }
      const paidPayout = buildPayout(ctx, createdRequest, {
        id: createdRequest.stripe_payout_id!,
        status: "paid",
        failure_code: null,
        failure_message: null,
      });

      const result = await service.syncPayoutFromWebhook(paidPayout, SHARED_STRIPE_ACCOUNT_ID);

      expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, createdRequest.id);
      expect(row).toEqual(
        expect.objectContaining({
          id: createdRequest.id,
          stripe_payout_id: paidPayout.id,
          amount: paidPayout.amount,
          currency: paidPayout.currency,
          status: "paid",
          failure_code: null,
          failure_message: null,
          system_fee_amount: createdRequest.system_fee_amount,
          system_fee_state: createdRequest.system_fee_state,
          system_fee_idempotency_key: createdRequest.system_fee_idempotency_key,
          stripe_account_debit_transfer_id: createdRequest.stripe_account_debit_transfer_id,
          stripe_account_debit_payment_id: createdRequest.stripe_account_debit_payment_id,
          system_fee_failure_code: createdRequest.system_fee_failure_code,
          system_fee_failure_message: createdRequest.system_fee_failure_message,
        })
      );
      expect(new Date(row!.arrival_date!).getTime()).toBe(paidPayout.arrival_date! * 1000);
      expect(new Date(row!.stripe_created_at!).getTime()).toBe(paidPayout.created * 1000);
    });
  });

  describe("実DB制約", () => {
    let ctx: PayoutContextFixture;
    let originalFeeConfig: FeeConfigSnapshot;
    let payoutRequestsBefore: PayoutRequestFixture[];

    beforeEach(async () => {
      const fixture = await createSharedStripeContext("payout-system-fee-db-constraint");
      ctx = fixture.ctx;
      originalFeeConfig = fixture.originalFeeConfig;
      payoutRequestsBefore = await listPayoutRequests(ctx);
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 手数料と振込額の関係をDB側でも破れないようにする
    it("payout_requests.amountがgross_amountからsystem_fee_amountを差し引いた金額と一致しない時、DB制約で拒否されること", async () => {
      const { error } = await ctx.adminClient.from("payout_requests").insert({
        payout_profile_id: ctx.payoutProfileId,
        community_id: ctx.communityId,
        requested_by: ctx.user.id,
        stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
        stripe_payout_id: `po_invalid_system_fee_${uniqueTestId()}`,
        amount: 800,
        gross_amount: 1000,
        currency: "jpy",
        status: "pending",
        idempotency_key: `payout_invalid_system_fee_${uniqueTestId()}`,
        system_fee_amount: PAYOUT_REQUEST_FEE_AMOUNT,
        system_fee_state: "succeeded",
        system_fee_idempotency_key: `payout_fee_invalid_system_fee_${uniqueTestId()}`,
      });

      expect(error).toEqual(expect.objectContaining({ code: "23514" }));
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
    });
  });

  describe("残高不足", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;
    let payoutRequestsBefore: PayoutRequestFixture[];
    let stripePayoutIdsBefore: string[];
    let systemFeeChargeIdsBefore: string[];

    beforeEach(async () => {
      const fixture = await createSharedStripeContext("payout-system-fee-insufficient");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;

      await drainSharedAccountAvailableBalance();

      payoutRequestsBefore = await listPayoutRequests(ctx);
      stripePayoutIdsBefore = await listSharedStripePayoutIds();
      systemFeeChargeIdsBefore = await listPayoutSystemFeeChargeIds();
    }, 60_000);

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 実Stripe操作を開始せず、DBにも中途半端なrequestを残さないことを確認する
    it("connected accountのavailable残高がsystem_fee_amount以下の時、Account DebitもPayoutも作成せずpayout_requestも作成しないこと", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
      expect(await listSharedStripePayoutIds()).toEqual(stripePayoutIdsBefore);
      expect(await listPayoutSystemFeeChargeIds()).toEqual(systemFeeChargeIdsBefore);
    }, 60_000);
  });
});
