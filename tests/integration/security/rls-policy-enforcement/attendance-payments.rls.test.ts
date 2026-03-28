import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { generateGuestToken } from "@core/utils/guest-token";

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

async function insertAttendanceAsAdmin(
  setup: RLSTestSetup,
  eventId: string,
  suffix: string
): Promise<string> {
  const { data, error } = await setup.adminClient
    .from("attendances")
    .insert({
      event_id: eventId,
      nickname: `attendance-${suffix}`,
      email: `attendance-${suffix}@example.com`,
      status: "attending",
      guest_token: generateGuestToken(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Failed to insert attendance fixture: ${error?.message}`);
  }

  return data.id;
}

describe("attendance/payment RLS contracts", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("owner can delete own attendance", async () => {
    const { client } = await createAuthenticatedClient(setup.testUserEmail, setup.testUserPassword);
    const attendanceId = await insertAttendanceAsAdmin(setup, setup.testEventId, "owner-delete");

    const deleteResult = await client.from("attendances").delete().eq("id", attendanceId);
    expect(deleteResult.error).toBeNull();

    const selectResult = await client.from("attendances").select("id").eq("id", attendanceId);
    expect(selectResult.error).toBeNull();
    expect(selectResult.data ?? []).toHaveLength(0);
  });

  test("non-owner cannot delete another owner's attendance", async () => {
    const owner = await createAuthenticatedClient(setup.testUserEmail, setup.testUserPassword);
    const other = await createAuthenticatedClient(
      setup.anotherUserEmail,
      setup.anotherUserPassword
    );
    const attendanceId = await insertAttendanceAsAdmin(setup, setup.testEventId, "other-blocked");

    const deleteResult = await other.client.from("attendances").delete().eq("id", attendanceId);
    expect(deleteResult.error).toBeNull();

    const ownerView = await owner.client.from("attendances").select("id").eq("id", attendanceId);
    expect(ownerView.error).toBeNull();
    expect(ownerView.data ?? []).toHaveLength(1);
  });

  test("authenticated owner cannot direct-insert payments", async () => {
    const { client } = await createAuthenticatedClient(setup.testUserEmail, setup.testUserPassword);
    const attendanceId = setup.testAttendanceId;

    const insertResult = await client.from("payments").insert({
      attendance_id: attendanceId,
      method: "cash",
      amount: 1000,
      status: "pending",
    });

    expect(insertResult.error).not.toBeNull();

    const paymentResult = await client
      .from("payments")
      .select("id, attendance_id")
      .eq("attendance_id", attendanceId);
    expect(paymentResult.error).toBeNull();
    expect(paymentResult.data ?? []).toHaveLength(0);
  });
});
