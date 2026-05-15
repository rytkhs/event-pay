import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { type CookieOptions } from "@supabase/ssr";

jest.unmock("@core/auth/auth-utils");

const mockCookieStore = {
  values: new Map<string, string>(),
  get(name: string) {
    const value = this.values.get(name);
    return value === undefined ? undefined : { name, value };
  },
  getAll() {
    return Array.from(this.values.entries()).map(([name, value]) => ({ name, value }));
  },
  set(name: string, value: string, _options?: CookieOptions) {
    if (value === "") {
      this.values.delete(name);
      return;
    }
    this.values.set(name, value);
  },
  clear() {
    this.values.clear();
  },
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockCookieStore),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import type Stripe from "stripe";

import { CURRENT_COMMUNITY_COOKIE_NAME } from "@core/community/current-community";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getStripe } from "@core/stripe/client";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import { requestPayoutAction } from "@features/stripe-connect/actions/request-payout";

import { expectActionFailure, expectActionSuccess } from "@tests/helpers/assert-result";
import {
  createPayoutContextFixture,
  getPayoutRequestById,
  listPayoutRequests,
  type PayoutContextFixture,
  type PayoutRequestFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";
import { acquireStripeConnectSharedAccountLock } from "@tests/helpers/stripe-connect-shared-account-lock";

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
        test_scope: "request_payout_action_integration",
        test_run_id: uniqueTestId(),
      },
    },
    { idempotencyKey: `request_payout_action_fund_${uniqueTestId()}` }
  );

  if (paymentIntent.status !== "succeeded") {
    throw new Error(`Failed to fund shared Stripe account: ${paymentIntent.status}`);
  }

  await waitForSharedAccountCardAvailableBalance();
}

async function listSharedStripePayoutIds(): Promise<string[]> {
  const payouts = await getStripe().payouts.list(
    { limit: 20 },
    { stripeAccount: SHARED_STRIPE_ACCOUNT_ID }
  );
  return payouts.data.map((payout) => payout.id);
}

async function releaseSharedStripeAccountDbRows(): Promise<void> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Releasing shared payout action integration Stripe account",
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

async function createContext(): Promise<PayoutContextFixture> {
  await releaseSharedStripeAccountDbRows();
  return createPayoutContextFixture({
    emailPrefix: "request-payout-action",
    stripeAccountId: SHARED_STRIPE_ACCOUNT_ID,
    collectionReady: true,
  });
}

async function signInActionRequest(ctx: PayoutContextFixture): Promise<void> {
  const supabase = await createServerActionSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: ctx.user.email,
    password: ctx.user.password,
  });

  if (error) {
    throw new Error(`Failed to sign in request-payout-action test user: ${error.message}`);
  }

  mockCookieStore.set(CURRENT_COMMUNITY_COOKIE_NAME, ctx.communityId);
}

describe("requestPayoutAction 統合テスト", () => {
  let releaseSharedAccountLock: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    releaseSharedAccountLock = await acquireStripeConnectSharedAccountLock(
      "stripe-connect-payout-integration"
    );
  }, 130_000);

  afterAll(async () => {
    await releaseSharedAccountLock?.();
  });

  describe("Action境界", () => {
    let ctx: PayoutContextFixture;
    let payoutRequestsBefore: PayoutRequestSnapshot;
    let stripePayoutIdsBefore: string[];

    beforeEach(async () => {
      mockCookieStore.clear();
      ctx = await createContext();

      if (currentTestName().includes("ログイン済みユーザー")) {
        await signInActionRequest(ctx);
        await fundSharedAccountAvailableBalance();
      }

      payoutRequestsBefore = await listPayoutRequests(ctx);
      stripePayoutIdsBefore = await listSharedStripePayoutIds();
    }, 60000);

    afterEach(async () => {
      mockCookieStore.clear();
      await ctx?.cleanup();
    });

    // Server Actionから認証・current community解決・実DBの入金要求作成まで到達することを固定する
    it(
      "ログイン済みユーザーが現在のコミュニティで入金要求した時、成功ActionResultと作成済みpayout_requestを返すこと",
      async () => {
        const result = await requestPayoutAction();

        const data = expectActionSuccess(result);
        const row = await getPayoutRequestById(ctx, data.payoutRequestId);
        const stripePayout = await getStripe().payouts.retrieve(
          data.stripePayoutId,
          {},
          { stripeAccount: SHARED_STRIPE_ACCOUNT_ID }
        );

        expect(data).toEqual(
          expect.objectContaining({
            payoutRequestId: expect.any(String),
            stripePayoutId: expect.stringMatching(/^po_/),
            stripeAccountId: SHARED_STRIPE_ACCOUNT_ID,
            amount: expect.any(Number),
            grossAmount: expect.any(Number),
            systemFeeAmount: expect.any(Number),
            systemFeeState: "succeeded",
            currency: "jpy",
            status: "pending",
          })
        );
        expect(data.amount).toBeGreaterThan(0);
        expect(row).toEqual(
          expect.objectContaining({
            id: data.payoutRequestId,
            payout_profile_id: ctx.payoutProfileId,
            community_id: ctx.communityId,
            requested_by: ctx.user.id,
            stripe_account_id: SHARED_STRIPE_ACCOUNT_ID,
            stripe_payout_id: data.stripePayoutId,
            amount: data.amount,
            gross_amount: data.grossAmount,
            system_fee_amount: data.systemFeeAmount,
            system_fee_state: data.systemFeeState,
            currency: "jpy",
            status: "pending",
          })
        );
        expect(stripePayout.id).toBe(data.stripePayoutId);
        expect(stripePayout.amount).toBe(data.amount);
      },
      60000
    );

    // 未認証ではAction境界で止まり、Service/Stripe/DB副作用を起こさないことを固定する
    it("ログインユーザーを解決できない時、payout_requestもStripe Payoutも作成されず失敗ActionResultを返すこと", async () => {
      const result = await requestPayoutAction();

      const error = expectActionFailure(result);
      expect(error.code).toBe("UNAUTHORIZED");
      expect(await listPayoutRequests(ctx)).toEqual(payoutRequestsBefore);
      expect(await listSharedStripePayoutIds()).toEqual(stripePayoutIdsBefore);
    });
  });
});
