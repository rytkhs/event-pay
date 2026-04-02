import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { deleteCommunity } from "@features/communities/services/delete-community";
import { createOwnedCommunityFixture } from "@tests/helpers/community-owner-fixtures";

import type { Database } from "@/types/database";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

type AuthenticatedClient = {
  client: SupabaseClient<Database>;
  userId: string;
};

type DeleteCommunityClient = Parameters<typeof deleteCommunity>[0];

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

describe("deleteCommunity service integration", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("owner can soft delete own non-representative community", async () => {
    const { client, userId } = await createAuthenticatedClient(
      setup.testUserEmail,
      setup.testUserPassword
    );
    const fixture = await createOwnedCommunityFixture(userId, {
      withPayoutProfile: false,
    });

    const result = await deleteCommunity(
      client as unknown as DeleteCommunityClient,
      userId,
      fixture.community.id
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("expected success");
    }

    expect(result.data).toEqual({
      communityId: fixture.community.id,
    });

    const adminVerify = await setup.adminClient
      .from("communities")
      .select("id, is_deleted, deleted_at")
      .eq("id", fixture.community.id)
      .single();

    expect(adminVerify.error).toBeNull();
    expect(adminVerify.data?.id).toBe(fixture.community.id);
    expect(adminVerify.data?.is_deleted).toBe(true);
    expect(adminVerify.data?.deleted_at).toEqual(expect.any(String));

    const ownerVerify = await client
      .from("communities")
      .select("id")
      .eq("id", fixture.community.id);

    expect(ownerVerify.error).toBeNull();
    expect(ownerVerify.data ?? []).toHaveLength(0);
  });

  test("owner cannot delete representative community", async () => {
    const { client, userId } = await createAuthenticatedClient(
      setup.testUserEmail,
      setup.testUserPassword
    );

    const result = await deleteCommunity(
      client as unknown as DeleteCommunityClient,
      userId,
      setup.testCommunityId
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("RESOURCE_CONFLICT");
    expect(result.error.userMessage).toBe(
      "代表コミュニティに設定されているため削除できません。付け替え後に削除してください"
    );

    const adminVerify = await setup.adminClient
      .from("communities")
      .select("id, is_deleted, deleted_at")
      .eq("id", setup.testCommunityId)
      .single();

    expect(adminVerify.error).toBeNull();
    expect(adminVerify.data?.id).toBe(setup.testCommunityId);
    expect(adminVerify.data?.is_deleted).toBe(false);
    expect(adminVerify.data?.deleted_at).toBeNull();
  });
});
