import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClient } from "@supabase/supabase-js";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";

import type { Database } from "@/types/database";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

async function createAuthenticatedClient(email: string, password: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }

  return client;
}

describe("community_contacts RLS", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("anon は community_contacts に insert できる", async () => {
    const factory = getSecureClientFactory();
    const anon = factory.createPublicClient();

    const { error } = await anon.from("community_contacts").insert({
      community_id: setup.testCommunityId,
      name: "Anon Contact",
      email: "anon-contact@example.com",
      message: "公開ページからの問い合わせ本文です",
      fingerprint_hash: `fp-${Date.now()}-anon`,
      user_agent: "jest",
      ip_hash: "hash",
    });

    expect(error).toBeNull();
  });

  test("owner のみ community_contacts を閲覧できる", async () => {
    const factory = getSecureClientFactory();
    const anon = factory.createPublicClient();

    const insert = await anon.from("community_contacts").insert({
      community_id: setup.testCommunityId,
      name: "Owner Visible Contact",
      email: "owner-visible@example.com",
      message: "owner select policy を確認するための問い合わせ本文です",
      fingerprint_hash: `fp-${Date.now()}-owner-visible`,
      user_agent: "jest",
      ip_hash: "hash",
    });
    expect(insert.error).toBeNull();

    const ownerClient = await createAuthenticatedClient(
      setup.testUserEmail,
      setup.testUserPassword
    );
    const otherClient = await createAuthenticatedClient(
      setup.anotherUserEmail,
      setup.anotherUserPassword
    );

    const ownerResult = await ownerClient
      .from("community_contacts")
      .select("id, community_id, email")
      .eq("community_id", setup.testCommunityId);
    expect(ownerResult.error).toBeNull();
    expect((ownerResult.data ?? []).length).toBeGreaterThan(0);

    const otherResult = await otherClient
      .from("community_contacts")
      .select("id, community_id, email")
      .eq("community_id", setup.testCommunityId);
    expect(otherResult.error).toBeNull();
    expect(otherResult.data ?? []).toHaveLength(0);

    const anonResult = await anon
      .from("community_contacts")
      .select("id, community_id, email")
      .eq("community_id", setup.testCommunityId);
    expect(anonResult.error).toBeNull();
    expect(anonResult.data ?? []).toHaveLength(0);
  });
});
