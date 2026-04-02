import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createGuestClient } from "@core/security/secure-client-factory.impl";

import type { Database } from "@/types/database";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

type AuthenticatedClient = SupabaseClient<Database>;

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

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }

  return client;
}

async function softDeleteCommunity(setup: RLSTestSetup) {
  const { error } = await setup.adminClient
    .from("communities")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", setup.testCommunityId);

  if (error) {
    throw new Error(`Failed to soft delete community fixture: ${error.message}`);
  }
}

describe("deleted community owner access", () => {
  let setup: RLSTestSetup;
  let ownerClient: AuthenticatedClient;

  beforeAll(async () => {
    setup = await setupRLSTest();
    ownerClient = await createAuthenticatedClient(setup.testUserEmail, setup.testUserPassword);
    await softDeleteCommunity(setup);
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("owner cannot read or update own deleted community", async () => {
    const selectResult = await ownerClient
      .from("communities")
      .select("id, name")
      .eq("id", setup.testCommunityId);

    expect(selectResult.error).toBeNull();
    expect(selectResult.data ?? []).toHaveLength(0);

    const updateResult = await ownerClient
      .from("communities")
      .update({
        name: "Renamed Deleted Community",
      })
      .eq("id", setup.testCommunityId)
      .select("id, name");

    expect(updateResult.error).toBeNull();
    expect(updateResult.data ?? []).toHaveLength(0);

    const verifyResult = await setup.adminClient
      .from("communities")
      .select("id, name")
      .eq("id", setup.testCommunityId)
      .single();

    expect(verifyResult.error).toBeNull();
    expect(verifyResult.data?.name).toBe("Test Community");
  });

  test("owner cannot mutate event or attendance rows under a deleted community", async () => {
    const insertEventResult = await ownerClient.from("events").insert({
      title: "Should Be Blocked",
      description: "deleted community insert should fail",
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      location: "Nowhere",
      fee: 0,
      capacity: 10,
      created_by: setup.testUserId,
      community_id: setup.testCommunityId,
      payout_profile_id: setup.testPayoutProfileId,
      invite_token: `inv_deleted_${Date.now()}_blocked`,
      payment_methods: ["cash"],
      registration_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      payment_deadline: null,
    });

    expect(insertEventResult.error).not.toBeNull();

    const updateEventResult = await ownerClient
      .from("events")
      .update({
        title: "Blocked Update",
      })
      .eq("id", setup.testEventId)
      .select("id, title");

    expect(updateEventResult.error).toBeNull();
    expect(updateEventResult.data ?? []).toHaveLength(0);

    const verifyEventResult = await setup.adminClient
      .from("events")
      .select("id, title")
      .eq("id", setup.testEventId)
      .single();

    expect(verifyEventResult.error).toBeNull();
    expect(verifyEventResult.data?.title).toBe("Test Event for RLS");

    const selectAttendanceResult = await ownerClient
      .from("attendances")
      .select("id")
      .eq("id", setup.testAttendanceId);

    expect(selectAttendanceResult.error).toBeNull();
    expect(selectAttendanceResult.data ?? []).toHaveLength(0);

    const deleteAttendanceResult = await ownerClient
      .from("attendances")
      .delete()
      .eq("id", setup.testAttendanceId);

    expect(deleteAttendanceResult.error).toBeNull();

    const verifyAttendanceResult = await setup.adminClient
      .from("attendances")
      .select("id")
      .eq("id", setup.testAttendanceId);

    expect(verifyAttendanceResult.error).toBeNull();
    expect(verifyAttendanceResult.data ?? []).toHaveLength(1);
  });

  test("owner and guest cannot read deleted community child rows via direct API", async () => {
    const { data: paymentRow, error: paymentInsertError } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: setup.testAttendanceId,
        method: "cash",
        amount: 1000,
        status: "pending",
      })
      .select("id")
      .single();

    expect(paymentInsertError).toBeNull();
    expect(paymentRow?.id).toBeDefined();

    const ownerPaymentResult = await ownerClient
      .from("payments")
      .select("id, attendance_id")
      .eq("id", paymentRow.id);

    expect(ownerPaymentResult.error).toBeNull();
    expect(ownerPaymentResult.data ?? []).toHaveLength(0);

    const guestClient = createGuestClient(setup.testGuestToken);
    const guestEventResult = await guestClient
      .from("events")
      .select("id, title")
      .eq("id", setup.testEventId);

    expect(guestEventResult.error).toBeNull();
    expect(guestEventResult.data ?? []).toHaveLength(0);
  });
});
