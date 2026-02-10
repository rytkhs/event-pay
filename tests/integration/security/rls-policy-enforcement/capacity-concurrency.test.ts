/**
 * RLS Policy Enforcement: Capacity and Concurrency Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Capacity and Concurrency", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("容量1のイベントで同時参加リクエストの一方が拒否される", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup capacity race test"
    );

    // 容量1のイベントを作成
    const capacityEvent = await admin
      .from("events")
      .insert({
        title: "Capacity Race Event",
        description: "race test",
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location: "Race Loc",
        fee: 0,
        capacity: 1,
        created_by: setup.testUserId,
        invite_token: "inv_capacity_race_123456789012",
        payment_methods: ["cash"],
        registration_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        payment_deadline: null,
      })
      .select("id")
      .single();

    if (!capacityEvent.data) throw new Error("failed to create capacity event");
    const capEventId = capacityEvent.data.id as string;

    // 2人の参加者（初期はnot_attending）
    const tokenA = "gst_" + "a".repeat(32);
    const tokenB = "gst_" + "b".repeat(32);
    const aIns = await admin
      .from("attendances")
      .insert({
        event_id: capEventId,
        nickname: "A",
        email: "a@example.com",
        status: "not_attending",
        guest_token: tokenA,
      })
      .select("id")
      .single();
    const bIns = await admin
      .from("attendances")
      .insert({
        event_id: capEventId,
        nickname: "B",
        email: "b@example.com",
        status: "not_attending",
        guest_token: tokenB,
      })
      .select("id")
      .single();
    if (!aIns.data || !bIns.data) throw new Error("failed to insert attendances");

    // 同時にattendingへ変更（fee=0なので支払い不要）
    const guestA = factory.createGuestClient(tokenA);
    const guestB = factory.createGuestClient(tokenB);
    const [r1, r2] = await Promise.all([
      (guestA as any).rpc("update_guest_attendance_with_payment", {
        p_attendance_id: aIns.data.id,
        p_guest_token: tokenA,
        p_status: "attending",
        p_payment_method: null,
        p_event_fee: 0,
      }),
      (guestB as any).rpc("update_guest_attendance_with_payment", {
        p_attendance_id: bIns.data.id,
        p_guest_token: tokenB,
        p_status: "attending",
        p_payment_method: null,
        p_event_fee: 0,
      }),
    ]);

    // どちらかは成功、どちらかはエラー（定員超過）
    const errors = [r1.error, r2.error].filter(Boolean);
    expect(errors.length).toBe(1);

    // attendingは1件のみ
    const count = await admin
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", capEventId)
      .eq("status", "attending");
    expect(count.count).toBe(1);
  });
});
