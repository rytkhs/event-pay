/**
 * RLS Policy Enforcement: Event Closure Guards Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { updateGuestAttendanceAction } from "@features/guest/actions/update-attendance";
import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Event Closure Guards", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("登録締切後はゲスト更新が拒否される", async () => {
    const factory = SecureSupabaseClientFactory.create();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "setup event closure guard test"
    );

    const closedEvent = await admin
      .from("events")
      .insert({
        title: "Closed Event",
        description: "closed",
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location: "Loc",
        fee: 0,
        capacity: 5,
        created_by: setup.testUserId,
        invite_token: "inv_closed_event_123456789012",
        payment_methods: ["cash"],
        registration_deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        payment_deadline: null,
      })
      .select("id")
      .single();
    if (!closedEvent.data) throw new Error("failed to create closed event");

    const token = "gst_" + "d".repeat(32);
    const attIns = await admin
      .from("attendances")
      .insert({
        event_id: closedEvent.data.id,
        nickname: "D",
        email: "d@example.com",
        status: "not_attending",
        guest_token: token,
      })
      .select("id")
      .single();
    if (!attIns.data) throw new Error("failed to insert attendance");

    const form = new FormData();
    form.set("guestToken", token);
    form.set("attendanceStatus", "attending");

    const result = await updateGuestAttendanceAction(form);
    // アプリロジックの期待: 更新は拒否される
    expect(result.success).toBe(false);
    // スキーマの期待: ステータスは変更されていない（not_attendingのまま）
    const verifyFactory = SecureSupabaseClientFactory.create();
    const adminVerify = await verifyFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "verify closure guard"
    );
    const after = await adminVerify
      .from("attendances")
      .select("status")
      .eq("id", attIns.data.id)
      .single();
    expect(after.data?.status).toBe("not_attending");
  });
});
