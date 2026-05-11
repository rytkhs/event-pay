import type Stripe from "stripe";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { createTestUser, deleteTestUser, type TestUser } from "@tests/helpers/test-user";

import type { Database } from "@/types/database";

type AdminClient = Awaited<ReturnType<typeof createAuditedAdminClient>>;
type PayoutRequestStatus = Database["public"]["Enums"]["payout_request_status"];

export type PayoutRequestFixture = {
  id: string;
  payout_profile_id: string;
  community_id: string;
  requested_by: string;
  stripe_account_id: string;
  stripe_payout_id: string | null;
  amount: number;
  currency: string;
  status: PayoutRequestStatus;
  idempotency_key: string;
  failure_code: string | null;
  failure_message: string | null;
};

export type PayoutContextFixture = {
  adminClient: AdminClient;
  user: TestUser;
  communityId: string;
  payoutProfileId: string;
  stripeAccountId: string;
  cleanup: () => Promise<void>;
};

export async function createPayoutContextFixture(
  options: {
    payoutsEnabled?: boolean;
    collectionReady?: boolean;
    attachPayoutProfileToCommunity?: boolean;
    stripeAccountId?: string;
    emailPrefix?: string;
  } = {}
): Promise<PayoutContextFixture> {
  const stripeAccountId =
    options.stripeAccountId ?? `acct_test_${Math.random().toString(36).slice(2, 14)}`;
  const user = await createTestUser(
    `${options.emailPrefix ?? "payout-unit"}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.com`,
    "TestPassword123!"
  );
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Creating payout unit fixture",
    {
      operationType: "INSERT",
      accessedTables: ["public.communities", "public.payout_profiles", "public.payout_requests"],
    }
  );

  const { data: community, error: communityError } = await adminClient
    .from("communities")
    .insert({
      created_by: user.id,
      name: `payout-unit-${Date.now()}`,
      slug: `payout-unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      legal_slug: `legal-payout-unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    })
    .select("id")
    .single();

  if (communityError || !community) {
    throw new Error(`Failed to create community fixture: ${communityError?.message}`);
  }

  const { data: payoutProfile, error: payoutProfileError } = await adminClient
    .from("payout_profiles")
    .insert({
      owner_user_id: user.id,
      stripe_account_id: stripeAccountId,
      status: "verified",
      collection_ready: options.collectionReady ?? true,
      payouts_enabled: options.payoutsEnabled ?? true,
      representative_community_id: community.id,
    })
    .select("id")
    .single();

  if (payoutProfileError || !payoutProfile) {
    throw new Error(`Failed to create payout profile fixture: ${payoutProfileError?.message}`);
  }

  if (options.attachPayoutProfileToCommunity !== false) {
    const { error: communityUpdateError } = await adminClient
      .from("communities")
      .update({ current_payout_profile_id: payoutProfile.id })
      .eq("id", community.id);

    if (communityUpdateError) {
      throw new Error(`Failed to attach payout profile fixture: ${communityUpdateError.message}`);
    }
  }

  return {
    adminClient,
    user,
    communityId: community.id,
    payoutProfileId: payoutProfile.id,
    stripeAccountId,
    cleanup: async () => {
      await adminClient.from("payout_requests").delete().eq("payout_profile_id", payoutProfile.id);
      await adminClient
        .from("communities")
        .update({ current_payout_profile_id: null })
        .eq("id", community.id);
      await adminClient.from("payout_profiles").delete().eq("id", payoutProfile.id);
      await adminClient.from("communities").delete().eq("id", community.id);
      await deleteTestUser(user.email);
    },
  };
}

export async function createPayoutRequestFixture(
  ctx: PayoutContextFixture,
  options: {
    status?: PayoutRequestStatus;
    amount?: number;
    stripePayoutId?: string | null;
    stripeAccountId?: string;
    idempotencyKey?: string;
    failureCode?: string | null;
    failureMessage?: string | null;
  } = {}
): Promise<PayoutRequestFixture> {
  const { data, error } = await ctx.adminClient
    .from("payout_requests")
    .insert({
      payout_profile_id: ctx.payoutProfileId,
      community_id: ctx.communityId,
      requested_by: ctx.user.id,
      stripe_account_id: options.stripeAccountId ?? ctx.stripeAccountId,
      stripe_payout_id: options.stripePayoutId ?? null,
      amount: options.amount ?? 1000,
      currency: "jpy",
      status: options.status ?? "requesting",
      idempotency_key:
        options.idempotencyKey ?? `payout_test_${Math.random().toString(36).slice(2, 16)}`,
      failure_code: options.failureCode ?? null,
      failure_message: options.failureMessage ?? null,
    })
    .select(
      "id, payout_profile_id, community_id, requested_by, stripe_account_id, stripe_payout_id, amount, currency, status, idempotency_key, failure_code, failure_message"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to create payout request fixture: ${error?.message}`);
  }

  return data;
}

export async function getPayoutRequestById(
  ctx: PayoutContextFixture,
  id: string
): Promise<PayoutRequestFixture | null> {
  const { data, error } = await ctx.adminClient
    .from("payout_requests")
    .select(
      "id, payout_profile_id, community_id, requested_by, stripe_account_id, stripe_payout_id, amount, currency, status, idempotency_key, failure_code, failure_message"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch payout request fixture: ${error.message}`);
  }

  return data ?? null;
}

export async function listPayoutRequests(
  ctx: PayoutContextFixture
): Promise<PayoutRequestFixture[]> {
  const { data, error } = await ctx.adminClient
    .from("payout_requests")
    .select(
      "id, payout_profile_id, community_id, requested_by, stripe_account_id, stripe_payout_id, amount, currency, status, idempotency_key, failure_code, failure_message"
    )
    .eq("payout_profile_id", ctx.payoutProfileId)
    .order("requested_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list payout request fixtures: ${error.message}`);
  }

  return data ?? [];
}

export function buildPayout(
  ctx: PayoutContextFixture,
  request: Pick<PayoutRequestFixture, "id" | "amount">,
  overrides: Partial<Stripe.Payout> = {}
): Stripe.Payout {
  return {
    id: overrides.id ?? "po_test_fixture",
    object: "payout",
    amount: overrides.amount ?? request.amount,
    arrival_date: overrides.arrival_date ?? Math.floor(Date.now() / 1000) + 86400,
    automatic: false,
    balance_transaction: null,
    created: overrides.created ?? Math.floor(Date.now() / 1000),
    currency: overrides.currency ?? "jpy",
    description: null,
    destination: "ba_test",
    failure_balance_transaction: null,
    failure_code: overrides.failure_code ?? null,
    failure_message: overrides.failure_message ?? null,
    livemode: false,
    metadata: overrides.metadata ?? { payout_request_id: request.id },
    method: "standard",
    original_payout: null,
    reconciliation_status: "not_applicable",
    reversed_by: null,
    source_type: "card",
    statement_descriptor: null,
    status: overrides.status ?? "paid",
    trace_id: null,
    type: "bank_account",
    ...overrides,
  } as Stripe.Payout;
}
