import { describe, expect } from "vitest";

import type { AppDatabase, AppSupabaseClient } from "@core/types/supabase";

import { test } from "../../fixtures/payment";

/**
 * `rpc_update_payment_status_safe`の現行DB遷移を検証する。
 *
 * 主催者によるcash Paymentの正常遷移、rankが下がる遷移の拒否、
 * Stripe Paymentの手動更新拒否を固定する。rankが上がる不正遷移を含む
 * CSH-03全体は、Issue #509で遷移仕様を確定してから保証する。
 */

type PaymentStatus = AppDatabase["public"]["Enums"]["payment_status_enum"];

/** RPCの戻り値は生成型では `Json` なので、契約として期待する形へ絞り込む。 */
type StatusUpdateResult = {
  payment_id: string;
  status: PaymentStatus;
  new_version: number;
  updated_at: string;
};

function updateCashStatus(
  client: AppSupabaseClient,
  input: { paymentId: string; status: PaymentStatus; expectedVersion: number; userId: string }
) {
  return client.rpc("rpc_update_payment_status_safe", {
    p_payment_id: input.paymentId,
    p_new_status: input.status,
    p_expected_version: input.expectedVersion,
    p_user_id: input.userId,
  });
}

describe("主催者による現金決済の更新", () => {
  test("未収から受領済みへ更新できる", async ({
    cashPayment,
    organizer,
    organizerClient,
    payment,
  }) => {
    const { data, error } = await updateCashStatus(organizerClient, {
      paymentId: cashPayment.id,
      status: "received",
      expectedVersion: cashPayment.version,
      userId: organizer.id,
    });

    expect(error).toBeNull();
    expect(data as StatusUpdateResult).toEqual({
      payment_id: cashPayment.id,
      status: "received",
      new_version: cashPayment.version + 1,
      updated_at: expect.any(String),
    });

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("received");
    expect(snapshot.paidAt).not.toBeNull();
    expect(snapshot.version).toBe(2);
  });

  describe.each(["received", "waived"] as const)("%sから", (status) => {
    test("未収へ戻せる", async ({ organizer, organizerClient, payment }) => {
      const created = await payment.createPaymentWithAttendance({ method: "cash", status });

      const { error } = await updateCashStatus(organizerClient, {
        paymentId: created.id,
        status: "pending",
        expectedVersion: created.version,
        userId: organizer.id,
      });

      expect(error).toBeNull();

      const snapshot = await payment.readPayment(created.id);
      expect(snapshot.status).toBe("pending");
      expect(snapshot.paidAt).toBeNull();
      expect(snapshot.version).toBe(2);
    });
  });

  test("受領済みから免除へ更新でき、入金日時は保持される", async ({
    organizer,
    organizerClient,
    payment,
  }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "cash",
      status: "received",
    });

    const { error } = await updateCashStatus(organizerClient, {
      paymentId: created.id,
      status: "waived",
      expectedVersion: created.version,
      userId: organizer.id,
    });

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.status).toBe("waived");
    expect(snapshot.paidAt).toBe(created.paidAt);
  });

  test("未収からキャンセルへ更新できる", async ({
    cashPayment,
    organizer,
    organizerClient,
    payment,
  }) => {
    const { error } = await updateCashStatus(organizerClient, {
      paymentId: cashPayment.id,
      status: "canceled",
      expectedVersion: cashPayment.version,
      userId: organizer.id,
    });

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("canceled");
    expect(snapshot.paidAt).toBeNull();
  });
});

describe("拒否される遷移", () => {
  describe.each([
    { from: "waived", to: "received" },
    { from: "canceled", to: "pending" },
    { from: "refunded", to: "received" },
    { from: "refunded", to: "pending" },
  ] as const)("$fromから$to", ({ from, to }) => {
    test("へは戻せない", async ({ organizer, organizerClient, payment }) => {
      const created = await payment.createPaymentWithAttendance({ method: "cash", status: from });

      const { error } = await updateCashStatus(organizerClient, {
        paymentId: created.id,
        status: to,
        expectedVersion: created.version,
        userId: organizer.id,
      });

      expect(error?.code).toBe("P0001");
      expect(error?.message).toContain("Rejecting status rollback");

      const snapshot = await payment.readPayment(created.id);
      expect(snapshot.status).toBe(from);
      expect(snapshot.version).toBe(1);
    });
  });

  test("Stripe決済は手動更新できない", async ({ organizer, organizerClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "pending",
    });

    const { error } = await updateCashStatus(organizerClient, {
      paymentId: created.id,
      status: "received",
      expectedVersion: created.version,
      userId: organizer.id,
    });

    expect(error?.code).toBe("P0003");

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.status).toBe("pending");
    expect(snapshot.version).toBe(1);
  });
});
