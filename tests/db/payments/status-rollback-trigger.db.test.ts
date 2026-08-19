import { describe, expect } from "vitest";

import type { AppDatabase } from "@core/types/supabase";

import { PAYMENT_PAID_AT, test } from "../../fixtures/payment";

/**
 * PAY-06: Payment状態は遅延イベントで降格しない。
 *
 * `trg_prevent_payment_status_rollback` はRLSではないため、RLSを迂回する
 * service_role からの直接更新でも必ず発火する。降格判定はCHECK制約より先に走る。
 */

type PaymentMethod = AppDatabase["public"]["Enums"]["payment_method_enum"];
type PaymentStatus = AppDatabase["public"]["Enums"]["payment_status_enum"];

type Transition = { method: PaymentMethod; from: PaymentStatus; to: PaymentStatus };

const DEMOTIONS: Transition[] = [
  { method: "cash", from: "received", to: "pending" },
  { method: "cash", from: "waived", to: "pending" },
  { method: "cash", from: "waived", to: "received" },
  { method: "cash", from: "canceled", to: "received" },
  { method: "cash", from: "refunded", to: "pending" },
  { method: "stripe", from: "paid", to: "pending" },
  { method: "stripe", from: "paid", to: "failed" },
  { method: "stripe", from: "failed", to: "pending" },
  { method: "stripe", from: "refunded", to: "paid" },
];

/** 追加の列を必要としない昇格。 */
const PROMOTIONS: Transition[] = [
  { method: "cash", from: "pending", to: "canceled" },
  { method: "cash", from: "received", to: "waived" },
  { method: "cash", from: "received", to: "refunded" },
  { method: "stripe", from: "paid", to: "refunded" },
];

describe("遅延イベントによる降格", () => {
  describe.each(DEMOTIONS)("$method決済の$fromから$to", ({ method, from, to }) => {
    test("への更新を拒否する", async ({ adminClient, payment }) => {
      const created = await payment.createPaymentWithAttendance({ method, status: from });

      const { error } = await adminClient
        .from("payments")
        .update({ status: to })
        .eq("id", created.id);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toContain("Rejecting status rollback");

      const snapshot = await payment.readPayment(created.id);
      expect(snapshot.status).toBe(from);
      expect(snapshot.version).toBe(1);
    });
  });
});

describe("状態の昇格", () => {
  describe.each(PROMOTIONS)("$method決済の$fromから$to", ({ method, from, to }) => {
    test("への更新を許可する", async ({ adminClient, payment }) => {
      const created = await payment.createPaymentWithAttendance({ method, status: from });

      const { error } = await adminClient
        .from("payments")
        .update({ status: to })
        .eq("id", created.id);

      expect(error).toBeNull();

      const snapshot = await payment.readPayment(created.id);
      expect(snapshot.status).toBe(to);
      expect(snapshot.version).toBe(2);
    });
  });

  test("現金決済は未収から受領済みへ更新できる", async ({ adminClient, cashPayment, payment }) => {
    const { error } = await adminClient
      .from("payments")
      .update({ status: "received", paid_at: PAYMENT_PAID_AT })
      .eq("id", cashPayment.id);

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("received");
    expect(snapshot.version).toBe(2);
  });

  test("Stripe決済は未収から失敗へ更新できる", async ({ adminClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "pending",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ status: "failed", stripe_payment_intent_id: payment.stripeIntentId("failure") })
      .eq("id", created.id);

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.status).toBe("failed");
    expect(snapshot.version).toBe(2);
  });

  test("同一状態への更新は降格として扱わない", async ({ adminClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "cash",
      status: "received",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ status: "received", amount: 500 })
      .eq("id", created.id);

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.status).toBe("received");
    expect(snapshot.amount).toBe(500);
    expect(snapshot.version).toBe(2);
  });
});
