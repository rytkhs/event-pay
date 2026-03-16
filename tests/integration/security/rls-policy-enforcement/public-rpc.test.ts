/**
 * RLS Policy Enforcement: Public RPC Tests
 */

import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";

import {
  createGuestClient,
  getSecureClientFactory,
} from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Public Event RPC", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("rpc_public_get_event は招待トークンだけで対象イベントを返す", async () => {
    const factory = getSecureClientFactory();
    const anon = factory.createPublicClient();

    const { data: events, error } = await (anon as any).rpc("rpc_public_get_event", {
      p_invite_token: setup.testInviteToken,
    });

    expect(error).toBeNull();
    const row = Array.isArray(events) ? events[0] : events;
    expect(row).toBeDefined();
    if (row) {
      expect((row as any).id).toBe(setup.testEventId);
    }
  });
});

describe("Public Attending Count RPC", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("invite token を渡すと正しい参加人数を返す", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup event for attending count"
    );

    const date = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const invite = `inv_${Math.random().toString(36).slice(2, 18)}`;
    const { data: event } = await admin
      .from("events")
      .insert({
        title: "Attending Count Event",
        date,
        location: "X",
        fee: 0,
        capacity: 10,
        created_by: setup.testUserId,
        community_id: setup.testCommunityId,
        payout_profile_id: setup.testPayoutProfileId,
        payment_methods: ["cash"],
        registration_deadline: date,
        payment_deadline: null,
        invite_token: invite,
      })
      .select("id")
      .single();

    if (!event?.id) throw new Error("failed to create event");

    await admin.from("attendances").insert([
      {
        event_id: event.id,
        nickname: "A",
        email: "a@example.com",
        status: "attending",
        guest_token: `gst_${"a".repeat(32)}`,
      },
      {
        event_id: event.id,
        nickname: "B",
        email: "b@example.com",
        status: "attending",
        guest_token: `gst_${"b".repeat(32)}`,
      },
    ]);

    const anon = factory.createPublicClient();
    const { error: errWrongInvite } = await (anon as any).rpc("rpc_public_attending_count", {
      p_event_id: event.id,
      p_invite_token: "inv_wrong_token_123456789012",
    });
    expect(errWrongInvite).not.toBeNull();

    const countAdmin = await admin
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    const { data: count, error } = await (anon as any).rpc("rpc_public_attending_count", {
      p_event_id: event.id,
      p_invite_token: invite,
    });

    expect(error).toBeNull();
    expect(count).toBe(countAdmin.count ?? 0);
  });
});

describe("Public Connect Account RPC", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("guest can fetch minimal connect account info for event organizer", async () => {
    const guest = createGuestClient(setup.testGuestToken);
    const { data, error } = await (guest as any).rpc("rpc_public_get_connect_account", {
      p_event_id: setup.testEventId,
      p_creator_id: setup.testUserId,
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeDefined();
    if (row) {
      expect((row as any).stripe_account_id).toBeDefined();
      expect((row as any).payouts_enabled).toBe(true);
    }
  });

  test("mismatched creator_id returns empty", async () => {
    const guest = createGuestClient(setup.testGuestToken);
    const { data, error } = await (guest as any).rpc("rpc_public_get_connect_account", {
      p_event_id: setup.testEventId,
      p_creator_id: "11111111-1111-1111-1111-111111111111",
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeUndefined();
  });
});

describe("Latest payment via RPC", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("rpc_guest_get_latest_payment returns most recently created amount", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup payments for latest payment rpc"
    );

    const date = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const eventIns = await admin
      .from("events")
      .insert({
        title: "Latest Payment Event",
        date,
        location: "X",
        fee: 100,
        capacity: 5,
        created_by: setup.testUserId,
        community_id: setup.testCommunityId,
        payout_profile_id: setup.testPayoutProfileId,
        payment_methods: ["cash"],
        registration_deadline: date,
        payment_deadline: null,
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
      })
      .select("id")
      .single();

    if (!eventIns.data) throw new Error("failed to create event");

    const token = `gst_${"z".repeat(32)}`;
    const attIns = await admin
      .from("attendances")
      .insert({
        event_id: eventIns.data.id,
        nickname: "Z",
        email: "z@example.com",
        status: "attending",
        guest_token: token,
      })
      .select("id")
      .single();

    if (!attIns.data) throw new Error("failed to insert attendance");

    const createdEarly = new Date(Date.now() - 2000).toISOString();
    const createdLate = new Date(Date.now() + 10).toISOString();
    await admin.from("payments").insert({
      attendance_id: attIns.data.id,
      amount: 300,
      method: "cash",
      status: "pending",
      created_at: createdEarly,
    });
    await admin.from("payments").insert({
      attendance_id: attIns.data.id,
      amount: 700,
      method: "cash",
      status: "received",
      paid_at: new Date().toISOString(),
      created_at: createdLate,
    });

    const guest = createGuestClient(token);
    const { data, error } = await (guest as any).rpc("rpc_guest_get_latest_payment", {
      p_attendance_id: attIns.data.id,
      p_guest_token: token,
    });

    expect(error).toBeNull();
    expect(data).toBe(700);
  });
});
