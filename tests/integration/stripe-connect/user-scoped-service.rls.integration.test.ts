import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { StripeConnectErrorHandler, StripeConnectService } from "@features/stripe-connect/server";

import type { Database } from "@/types/database";

import { setupRLSTest, type RLSTestSetup } from "../security/rls-policy-enforcement/rls-test-setup";

jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => ({
    accounts: {
      create: jest.fn().mockResolvedValue({
        id: "acct_user_scoped_test",
      }),
      del: jest.fn().mockResolvedValue({
        deleted: true,
      }),
    },
  })),
  generateIdempotencyKey: jest.fn(() => "test_idempotency_key"),
}));

type AuthenticatedClient = {
  client: SupabaseClient<Database>;
  userId: string;
};

async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<AuthenticatedClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for tests");
  }

  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Signed-in test user is missing an id");
  }

  return { client, userId };
}

describe("StripeConnectService with user-scoped Supabase client", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("createExpressAccount persists payout profile for the authenticated owner", async () => {
    const { client, userId } = await createAuthenticatedClient(
      setup.anotherUserEmail,
      setup.anotherUserPassword
    );
    const service = new StripeConnectService(client as never, new StripeConnectErrorHandler());

    const result = await service.createExpressAccount({
      userId,
      email: setup.anotherUserEmail,
      country: "JP",
      businessType: "individual",
    });

    expect(result.accountId).toBe("acct_user_scoped_test");

    const storedAccount = await service.getConnectAccountByUser(userId);
    expect(storedAccount).toBeDefined();
    expect(storedAccount?.owner_user_id).toBe(userId);
    expect(storedAccount?.stripe_account_id).toBe("acct_user_scoped_test");
  });

  test("updateAccountStatus updates the authenticated owner's payout profile", async () => {
    const { client, userId } = await createAuthenticatedClient(
      setup.testUserEmail,
      setup.testUserPassword
    );
    const service = new StripeConnectService(client as never, new StripeConnectErrorHandler());

    await service.updateAccountStatus({
      userId,
      stripeAccountId: "acct_test_123",
      status: "verified",
      chargesEnabled: false,
      payoutsEnabled: false,
      trigger: "manual",
    });

    const { data, error } = await client
      .from("payout_profiles")
      .select("id, status, charges_enabled, payouts_enabled")
      .eq("id", setup.testPayoutProfileId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.status).toBe("verified");
    expect(data?.charges_enabled).toBe(false);
    expect(data?.payouts_enabled).toBe(false);
  });
});
