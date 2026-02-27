/**
 * RLS Policy Enforcement: Public RPC Tests
 *
 * Includes:
 * - Invite Header Requirement
 * - Public Attending Count RPC
 * - Public Connect Account RPC
 * - Latest payment via RPC
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { createAuditedAdminClient, createGuestClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Invite Header Requirement", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("ヘッダー未設定ではrpc_public_get_eventは返らない", async () => {
    const admin = await createAuditedAdminClient(
    const anon = factory.createPublicClient();

    const { data: events, error } = await (anon as any).rpc("rpc_public_get_event", {
      p_invite_token: setup.testInviteToken,
    });
    // can_access_eventがヘッダーを見るため、未設定だとヒットしない
    expect(error).toBeNull();
    const row = Array.isArray(events) ? events[0] : events;
    expect(row).toBeUndefined();
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

  test("invite header required; with header returns correct count", async () => {
    const admin = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup event for attending count"
    );

    // Create dedicated event
    const now = Date.now();
    const date = new Date(now + 60 * 60 * 1000).toISOString();
    const invite = "inv_" + Math.random().toString(36).slice(2, 18);
    const { data: e } = await admin
      .from("events")
      .insert({
        title: "Attending Count Event",
        date,
        location: "X",
        fee: 0,
        capacity: 10,
        payment_methods: ["cash"],
        registration_deadline: date,
        payment_deadline: null,
        invite_token: invite,
        created_by: setup.testUserId,
      })
      .select("id")
      .single();

    if (!e?.id) throw new Error("failed to create event");

    // Two attendances
    const t1 = "gst_" + "a".repeat(32);
    const t2 = "gst_" + "b".repeat(32);
    await admin.from("attendances").insert([
      {
        event_id: e.id,
        nickname: "A",
        email: "a@example.com",
        status: "attending",
        guest_token: t1,
      },
      {
        event_id: e.id,
        nickname: "B",
        email: "b@example.com",
        status: "attending",
        guest_token: t2,
      },
    ]);

    // Without header: should error
    const anon = factory.createPublicClient();
    const { error: errNoHeader } = await (anon as any).rpc("rpc_public_attending_count", {
      p_event_id: e.id,
    });
    expect(errNoHeader).not.toBeNull();

    // With header: correct count
    const anonWithHeader = factory.createPublicClient({
      headers: { "x-invite-token": invite },
    });
    // small delay to ensure visibility
    await new Promise((r) => setTimeout(r, 20));
    // admin ground truth
    const countAdmin = await admin
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", e.id)
      .eq("status", "attending");
    const expected = countAdmin.count ?? 0;
    const { data: cnt, error } = await (anonWithHeader as any).rpc("rpc_public_attending_count", {
      p_event_id: e.id,
    });
    expect(error).toBeNull();
    expect(cnt).toBe(expected);
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
    const admin = await createAuditedAdminClient(
    const anonWithHeader = factory.createPublicClient({
      headers: { "x-invite-token": setup.testInviteToken },
    });

    const { data, error } = await (anonWithHeader as any).rpc("rpc_public_get_connect_account", {
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
    const admin = await createAuditedAdminClient(
    const anonWithHeader = factory.createPublicClient({
      headers: { "x-invite-token": setup.testInviteToken },
    });

    const { data, error } = await (anonWithHeader as any).rpc("rpc_public_get_connect_account", {
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
    const admin = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup payments for latest payment rpc"
    );

    // create event and attendance
    const dt = new Date(Date.now() + 3600_000).toISOString();
    const eventIns = await admin
      .from("events")
      .insert({
        title: "Latest Payment Event",
        date: dt,
        location: "X",
        fee: 100,
        capacity: 5,
        payment_methods: ["cash"],
        registration_deadline: dt,
        payment_deadline: null,
        invite_token: "inv_" + Math.random().toString(36).slice(2, 18),
        created_by: setup.testUserId,
      })
      .select("id")
      .single();
    if (!eventIns.data) throw new Error("failed to create event");

    const token = "gst_" + "z".repeat(32);
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

    // insert two payments with controlled created_at for deterministic ordering
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

    const guest = await createGuestClient(token);
    const { data, error } = await (guest as any).rpc("rpc_guest_get_latest_payment", {
      p_attendance_id: attIns.data.id,
      p_guest_token: token,
    });
    expect(error).toBeNull();
    // created_at DESC ordering means last inserted (700) should be returned
    expect(data).toBe(700);
  });
});
