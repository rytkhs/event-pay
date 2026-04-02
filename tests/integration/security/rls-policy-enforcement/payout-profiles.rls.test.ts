import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createOwnedCommunityFixture } from "@tests/helpers/community-owner-fixtures";

import type { Database } from "@/types/database";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

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

describe("payout_profiles RLS", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("owner can insert own payout profile", async () => {
    const { client, userId } = await createAuthenticatedClient(
      setup.anotherUserEmail,
      setup.anotherUserPassword
    );

    const stripeAccountId = `acct_rls_insert_${Date.now()}`;
    const insertResult = await client.from("payout_profiles").insert({
      owner_user_id: userId,
      stripe_account_id: stripeAccountId,
      status: "unverified",
      charges_enabled: false,
      payouts_enabled: false,
      representative_community_id: null,
    });

    expect(insertResult.error).toBeNull();

    const { data, error } = await client
      .from("payout_profiles")
      .select("id, owner_user_id, stripe_account_id")
      .eq("owner_user_id", userId)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.owner_user_id).toBe(userId);
    expect(data?.stripe_account_id).toBe(stripeAccountId);
  });

  test("owner can update own representative_community_id", async () => {
    const { client, userId } = await createAuthenticatedClient(
      setup.testUserEmail,
      setup.testUserPassword
    );
    const community = await createOwnedCommunityFixture(userId, {
      withPayoutProfile: false,
    });

    const { data, error } = await client
      .from("payout_profiles")
      .update({
        representative_community_id: community.community.id,
      })
      .eq("id", setup.testPayoutProfileId)
      .select("id, representative_community_id")
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data?.id).toBe(setup.testPayoutProfileId);
    expect(data?.representative_community_id).toBe(community.community.id);
  });
});
