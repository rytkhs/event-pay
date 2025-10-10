import { describe, test, expect } from "@jest/globals";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  createPendingTestPayment,
} from "@tests/helpers/test-payment-data";

import type { Database } from "@/types/database";

describe("Payment constraints & triggers (schema-level)", () => {
  test("attendanceあたりpending決済1件制限（部分ユニークインデックス）", async () => {
    const user = await createTestUserWithConnect();
    const event = await createPaidTestEvent(user.id, { fee: 1200, paymentMethods: ["stripe"] });
    const attendance = await createTestAttendance(event.id, { status: "attending" });

    // 1st pending is ok
    await createPendingTestPayment(attendance.id, { amount: event.fee, method: "stripe" });

    // 2nd pending should violate unique partial index
    const admin = await SecureSupabaseClientFactory.getInstance().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Insert 2nd pending payment to trigger unique partial index",
      { accessedTables: ["public.payments"], operationType: "INSERT" }
    );

    const { error } = await admin
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        amount: event.fee,
        status: "pending",
        method: "stripe",
      })
      .select("id")
      .single();

    expect(error).not.toBeNull();
    if (error) {
      // unique_violation
      expect(error.code).toBe("23505");
    }
  });

  test("Stripe intent必須CHECK（paidなのにintent無でNG）", async () => {
    const user = await createTestUserWithConnect();
    const event = await createPaidTestEvent(user.id, { fee: 1500, paymentMethods: ["stripe"] });
    const attendance = await createTestAttendance(event.id, { status: "attending" });

    const admin = await SecureSupabaseClientFactory.getInstance().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Insert stripe payment without intent_id to trigger CHECK",
      { accessedTables: ["public.payments"], operationType: "INSERT" }
    );

    const { error } = await admin
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        method: "stripe" as Database["public"]["Enums"]["payment_method_enum"],
        amount: event.fee,
        status: "paid" as Database["public"]["Enums"]["payment_status_enum"],
        // stripe_payment_intent_id is missing intentionally
      })
      .select("id")
      .single();

    expect(error).not.toBeNull();
    if (error) {
      // check_violation
      expect(error.code).toBe("23514");
    }
  });

  test("支払ステータス降格禁止トリガ（received→pendingで拒否、paid_at必須も考慮）", async () => {
    const user = await createTestUserWithConnect();
    const event = await createPaidTestEvent(user.id, { fee: 1000, paymentMethods: ["cash"] });
    const attendance = await createTestAttendance(event.id, { status: "attending" });

    // 現金支払いをreceivedに設定（CHECK対策としてpaid_atを必ず設定）
    const admin = await SecureSupabaseClientFactory.getInstance().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Create cash payment and then attempt rollback",
      { accessedTables: ["public.payments"], operationType: "INSERT" }
    );

    const { data: payment } = await admin
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        amount: event.fee,
        method: "cash",
        status: "received",
        paid_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();

    expect(payment?.status).toBe("received");

    // 降格（received -> pending）を試みる
    const { error: updateError } = await admin
      .from("payments")
      .update({ status: "pending" })
      .eq("id", payment?.id)
      .select("id")
      .single();

    expect(updateError).not.toBeNull();
    if (updateError) {
      // trigger-raised error (custom message)
      expect(updateError.message).toMatch(/Rejecting status rollback/i);
    }
  });

  test("payments_paid_at_when_paid CHECK (paid/received require paid_at)", async () => {
    const user = await createTestUserWithConnect();
    const event = await createPaidTestEvent(user.id, { fee: 1000, paymentMethods: ["cash"] });
    const attendance = await createTestAttendance(event.id, { status: "attending" });

    const admin = await SecureSupabaseClientFactory.getInstance().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Insert payment with paid status but missing paid_at"
    );

    const { error } = await admin
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        amount: event.fee,
        method: "cash",
        status: "received",
      })
      .select("id")
      .single();

    expect(error).not.toBeNull();
    if (error) {
      expect(error.code).toBe("23514");
    }
  });

  test("negative amounts and unique intent id constraint", async () => {
    const user = await createTestUserWithConnect();
    const event = await createPaidTestEvent(user.id, { fee: 1200, paymentMethods: ["stripe"] });
    const attendance = await createTestAttendance(event.id, { status: "attending" });

    const admin = await SecureSupabaseClientFactory.getInstance().createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Insert negative amount and duplicate intent id"
    );

    // Negative amount should fail (payments_amount_check)
    const neg = await admin
      .from("payments")
      .insert({ attendance_id: attendance.id, amount: -1, method: "stripe", status: "pending" })
      .select("id")
      .single();
    expect(neg.error).not.toBeNull();

    // Unique intent id
    const intent = "pi_test_intent_123";
    const ok = await admin
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        amount: event.fee,
        method: "stripe",
        status: "pending",
        stripe_payment_intent_id: intent,
      })
      .select("id")
      .single();
    expect(ok.error).toBeNull();

    const dup = await admin
      .from("payments")
      .insert({
        attendance_id: attendance.id,
        amount: event.fee,
        method: "stripe",
        status: "pending",
        stripe_payment_intent_id: intent,
      })
      .select("id")
      .single();
    expect(dup.error).not.toBeNull();
    if (dup.error) {
      expect(dup.error.code).toBe("23505");
    }
  });
});
