import { describe, expect } from "vitest";

import { test } from "../../fixtures/payment";

/**
 * CSH-02: `received`はcashだけ、`paid`と`failed`はStripeだけというDB整合を守る。
 *
 * 決済手段と状態の対応が崩れると、現金の入金実績とオンライン決済の
 * 突合結果が混ざるため、直接更新でもRPC経由でも同じ制約が効く。
 */

const CONSTRAINT = "payments_method_status_consistency";

describe("現金決済の状態", () => {
  describe.each(["paid", "failed"] as const)("%s", (status) => {
    test("の現金決済は作成できない", async ({ adminClient, payment }) => {
      const attendance = await payment.createAttendance();

      const { error } = await adminClient
        .from("payments")
        .insert(payment.buildPayment({ attendanceId: attendance.id, method: "cash", status }));

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(CONSTRAINT);

      const { count, error: countError } = await adminClient
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("attendance_id", attendance.id);

      expect(countError).toBeNull();
      expect(count).toBe(0);
    });
  });

  test("現金決済は受領済みで作成できる", async ({ payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "cash",
      status: "received",
    });

    expect(created.status).toBe("received");
  });

  test("未収の現金決済を失敗状態へ直接更新できない", async ({
    adminClient,
    cashPayment,
    payment,
  }) => {
    const { error } = await adminClient
      .from("payments")
      .update({ status: "failed" })
      .eq("id", cashPayment.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(CONSTRAINT);

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("pending");
  });
});

describe("Stripe決済の状態", () => {
  test("Stripe決済は受領済みで作成できない", async ({ adminClient, payment }) => {
    const attendance = await payment.createAttendance();

    const { error } = await adminClient.from("payments").insert(
      payment.buildPayment({
        attendanceId: attendance.id,
        method: "stripe",
        status: "received",
      })
    );

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(CONSTRAINT);
  });

  describe.each(["paid", "failed"] as const)("%s", (status) => {
    test("のStripe決済は作成できる", async ({ payment }) => {
      const created = await payment.createPaymentWithAttendance({ method: "stripe", status });

      expect(created.status).toBe(status);
    });
  });

  test("支払済みStripe決済の決済手段を現金へ変更できない", async ({ adminClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "paid",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ method: "cash" })
      .eq("id", created.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(CONSTRAINT);

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.method).toBe("stripe");
  });
});

describe("RPC経由の整合", () => {
  test("主催者は現金決済を支払済みへ更新できない", async ({
    cashPayment,
    organizer,
    organizerClient,
    payment,
  }) => {
    const { error } = await organizerClient.rpc("rpc_update_payment_status_safe", {
      p_payment_id: cashPayment.id,
      p_new_status: "paid",
      p_expected_version: cashPayment.version,
      p_user_id: organizer.id,
    });

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(CONSTRAINT);

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("pending");
    expect(snapshot.version).toBe(1);
  });
});
