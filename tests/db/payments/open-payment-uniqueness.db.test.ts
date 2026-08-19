import { describe, expect } from "vitest";

import { PAYMENT_PAID_AT, test } from "../../fixtures/payment";

/**
 * PAY-05: Attendanceごとのopen Paymentは最大1件である。
 *
 * 部分UNIQUE index `unique_open_payment_per_attendance` は `pending` だけを対象にする。
 * 確定・キャンセル済みの決済は履歴として残るため、未収決済と共存できる。
 */

describe("未収決済の一意性", () => {
  test("同一参加者に2件目の未収決済を作成できない", async ({ adminClient, payment }) => {
    const first = await payment.createPaymentWithAttendance();

    const { error } = await adminClient
      .from("payments")
      .insert(payment.buildPayment({ attendanceId: first.attendanceId }));

    expect(error?.code).toBe("23505");
    expect(error?.message).toContain("unique_open_payment_per_attendance");

    const { count, error: countError } = await adminClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", first.attendanceId);

    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  test("同一参加者への並行作成は1件だけ成功する", async ({ adminClient, payment }) => {
    const attendance = await payment.createAttendance();
    const firstClient = payment.createAdminClient();
    const secondClient = payment.createAdminClient();

    const results = await Promise.all([
      firstClient
        .from("payments")
        .insert(payment.buildPayment({ attendanceId: attendance.id, label: "concurrent-a" })),
      secondClient
        .from("payments")
        .insert(payment.buildPayment({ attendanceId: attendance.id, label: "concurrent-b" })),
    ]);

    expect(results.map((result) => result.error?.code ?? "success").sort()).toEqual([
      "23505",
      "success",
    ]);

    const { count, error } = await adminClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", attendance.id);

    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  test("受領済みになれば新しい未収決済を作成できる", async ({ adminClient, payment }) => {
    const first = await payment.createPaymentWithAttendance();

    const { error: updateError } = await adminClient
      .from("payments")
      .update({ status: "received", paid_at: PAYMENT_PAID_AT })
      .eq("id", first.id);

    expect(updateError).toBeNull();

    const { error } = await adminClient
      .from("payments")
      .insert(payment.buildPayment({ attendanceId: first.attendanceId, label: "re-open" }));

    expect(error).toBeNull();

    const { count, error: pendingError } = await adminClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", first.attendanceId)
      .eq("status", "pending");

    expect(pendingError).toBeNull();
    expect(count).toBe(1);

    const { count: totalCount, error: totalError } = await adminClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", first.attendanceId);

    expect(totalError).toBeNull();
    expect(totalCount).toBe(2);
  });

  test("キャンセル済み決済は未収決済と共存できる", async ({ adminClient, payment }) => {
    const canceled = await payment.createPaymentWithAttendance({ status: "canceled" });

    const { error } = await adminClient
      .from("payments")
      .insert(payment.buildPayment({ attendanceId: canceled.attendanceId, label: "after-cancel" }));

    expect(error).toBeNull();

    const { count, error: countError } = await adminClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", canceled.attendanceId);

    expect(countError).toBeNull();
    expect(count).toBe(2);
  });
});
