import { describe, expect } from "vitest";

import { test } from "../../fixtures/payment";

/**
 * PAY-02: `paid` / `received` には `paid_at` が必要である。
 *
 * 入金日時のない入金済み決済は、KPIと精算の集計根拠を失うため作成も更新も許さない。
 */

describe("入金済み決済の入金日時", () => {
  test("受領済みの現金決済は入金日時なしで作成できない", async ({ adminClient, payment }) => {
    const attendance = await payment.createAttendance();

    const { error } = await adminClient.from("payments").insert(
      payment.buildPayment({
        attendanceId: attendance.id,
        method: "cash",
        status: "received",
        paid_at: null,
      })
    );

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_paid_at_when_paid");
  });

  test("支払済みのStripe決済は入金日時なしで作成できない", async ({ adminClient, payment }) => {
    const attendance = await payment.createAttendance();

    const { error } = await adminClient.from("payments").insert(
      payment.buildPayment({
        attendanceId: attendance.id,
        method: "stripe",
        status: "paid",
        paid_at: null,
      })
    );

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_paid_at_when_paid");
  });

  test("受領済み決済の入金日時をNULLへ更新できない", async ({ adminClient, payment }) => {
    const received = await payment.createPaymentWithAttendance({
      method: "cash",
      status: "received",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ paid_at: null })
      .eq("id", received.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_paid_at_when_paid");

    const snapshot = await payment.readPayment(received.id);
    expect(snapshot.paidAt).not.toBeNull();
  });

  test("未収から受領済みへの直接更新は入金日時がなければ拒否される", async ({
    adminClient,
    cashPayment,
    payment,
  }) => {
    const { error } = await adminClient
      .from("payments")
      .update({ status: "received" })
      .eq("id", cashPayment.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_paid_at_when_paid");

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("pending");
  });
});

describe.each(["pending", "waived", "canceled"] as const)("%sの現金決済", (status) => {
  test("入金日時なしで作成できる", async ({ payment }) => {
    const created = await payment.createPaymentWithAttendance({ method: "cash", status });

    expect(created.status).toBe(status);
    expect(created.paidAt).toBeNull();
  });
});

describe("RPC経由の入金日時", () => {
  test("受領済みへの更新で入金日時が記録される", async ({
    cashPayment,
    organizer,
    organizerClient,
    payment,
  }) => {
    const { error } = await organizerClient.rpc("rpc_update_payment_status_safe", {
      p_payment_id: cashPayment.id,
      p_new_status: "received",
      p_expected_version: cashPayment.version,
      p_user_id: organizer.id,
    });

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("received");
    expect(snapshot.paidAt).not.toBeNull();
  });
});
