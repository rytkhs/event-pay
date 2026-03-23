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
      expect((row as any).community_name).toBe("Test Community");
      expect((row as any).community_legal_slug).toBe(setup.testCommunityLegalSlug);
      expect(row).not.toHaveProperty("created_by");
      expect(row).not.toHaveProperty("organizer_name");
    }
  });

  test("削除済み community に属する event は public RPC から取得できない", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "soft delete community for public event rpc test"
    );
    const anon = factory.createPublicClient();

    const { error: updateError } = await admin
      .from("communities")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", setup.testCommunityId);

    expect(updateError).toBeNull();

    const { data, error } = await (anon as any).rpc("rpc_public_get_event", {
      p_invite_token: setup.testInviteToken,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data) ? data : []).toHaveLength(0);
  });
});

describe("Public Community RPC", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("rpc_public_get_community_by_slug は未削除 community の最小公開情報を返す", async () => {
    const factory = getSecureClientFactory();
    const anon = factory.createPublicClient();

    const { data, error } = await (anon as any).rpc("rpc_public_get_community_by_slug", {
      p_slug: setup.testCommunitySlug,
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeDefined();
    if (row) {
      expect((row as any).id).toBe(setup.testCommunityId);
      expect((row as any).slug).toBe(setup.testCommunitySlug);
      expect((row as any).legal_slug).toBe(setup.testCommunityLegalSlug);
      expect(row).not.toHaveProperty("created_by");
    }
  });

  test("rpc_public_get_community_by_legal_slug は legal_slug でも解決できる", async () => {
    const factory = getSecureClientFactory();
    const anon = factory.createPublicClient();

    const { data, error } = await (anon as any).rpc("rpc_public_get_community_by_legal_slug", {
      p_legal_slug: setup.testCommunityLegalSlug,
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeDefined();
    if (row) {
      expect((row as any).id).toBe(setup.testCommunityId);
      expect((row as any).slug).toBe(setup.testCommunitySlug);
    }
  });

  test("削除済み community は public RPC から取得できない", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "soft delete community for public rpc test"
    );
    const anon = factory.createPublicClient();

    const { error: updateError } = await admin
      .from("communities")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", setup.anotherCommunityId);

    expect(updateError).toBeNull();

    const { data, error } = await (anon as any).rpc("rpc_public_get_community_by_slug", {
      p_slug: setup.anotherCommunitySlug,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data) ? data : []).toHaveLength(0);
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
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeDefined();
    if (row) {
      expect((row as any).stripe_account_id).toBeDefined();
      expect((row as any).payouts_enabled).toBe(true);
    }
  });

  test("event に payout_profile_id が無い場合は空になる", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup event without payout profile for public connect rpc"
    );

    const invite = `inv_${Math.random().toString(36).slice(2, 18)}`;
    const guestToken = `gst_${"c".repeat(32)}`;
    const date = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data: event } = await admin
      .from("events")
      .insert({
        title: "No Payout Event",
        date,
        location: "X",
        fee: 1000,
        capacity: 10,
        created_by: setup.testUserId,
        community_id: setup.testCommunityId,
        payout_profile_id: null,
        payment_methods: ["stripe"],
        registration_deadline: date,
        payment_deadline: date,
        invite_token: invite,
      })
      .select("id")
      .single();

    if (!event?.id) throw new Error("failed to create event without payout profile");

    await admin.from("attendances").insert({
      event_id: event.id,
      nickname: "No Payout Guest",
      email: "nopayout@example.com",
      status: "attending",
      guest_token: guestToken,
    });

    const guest = createGuestClient(guestToken);
    const { data, error } = await (guest as any).rpc("rpc_public_get_connect_account", {
      p_event_id: event.id,
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeUndefined();
  });

  test("別イベントのゲストは他イベントの payout 情報を取得できない", async () => {
    const guest = createGuestClient(setup.anotherGuestToken);
    const { data, error } = await (guest as any).rpc("rpc_public_get_connect_account", {
      p_event_id: setup.testEventId,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
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
