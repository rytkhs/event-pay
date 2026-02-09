/**
 * RLS Policy Enforcement: Unique Pending Payments Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { updateGuestAttendanceAction } from "@/app/guest/[token]/actions";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Unique Pending Payments", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("同一参加に対し未確定(pending)決済は1件に抑止される", async () => {
    const factory = getSecureClientFactory();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup unique pending test"
    );

    // 有料イベントの作成
    const paidEvent = await admin
      .from("events")
      .insert({
        title: "Pending Unique Event",
        description: "pending unique",
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location: "Loc",
        fee: 500,
        capacity: 10,
        created_by: setup.testUserId,
        invite_token: "inv_pending_unique_123456789012",
        payment_methods: ["cash"],
        registration_deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        payment_deadline: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (!paidEvent.data) throw new Error("failed to create paid event");

    const token = "gst_" + "c".repeat(32);
    const attIns = await admin
      .from("attendances")
      .insert({
        event_id: paidEvent.data.id,
        nickname: "C",
        email: "c@example.com",
        status: "not_attending",
        guest_token: token,
      })
      .select("id")
      .single();
    if (!attIns.data) throw new Error("failed to insert attendance");

    // サーバーアクションを2回叩いてもpendingは1件
    const formData1 = new FormData();
    formData1.set("guestToken", token);
    formData1.set("attendanceStatus", "attending");
    formData1.set("paymentMethod", "cash");

    const formData2 = new FormData();
    formData2.set("guestToken", token);
    formData2.set("attendanceStatus", "attending");
    formData2.set("paymentMethod", "cash");

    const [res1, res2] = await Promise.all([
      updateGuestAttendanceAction(formData1),
      updateGuestAttendanceAction(formData2),
    ]);
    expect(res1.success || res2.success).toBe(true);

    const pending = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", attIns.data.id)
      .eq("status", "pending");
    expect(pending.count).toBe(1);
  });
});
