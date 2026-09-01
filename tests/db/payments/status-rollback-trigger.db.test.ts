import { describe, expect } from "vitest";

import type { AppDatabase } from "@core/types/supabase";

import { PAYMENT_PAID_AT, test } from "../../fixtures/payment";

/**
 * PAY-06 / CSH-03: Payment状態は遷移表を逸脱しない。
 *
 * `trg_prevent_invalid_payment_status_transition` はRLSではないため、RLSを迂回する
 * service_role からの直接更新でも必ず発火する。遷移判定はCHECK制約より先に走る。
 *
 * 遷移表の正本は `public.can_promote_payment_status()`。ここではDB契約として
 * 拒否／許可される具体的な組み合わせを固定する。TSミラーとの一致は
 * `status-transition-parity.db.test.ts` が担保する。
 */

type PaymentMethod = AppDatabase["public"]["Enums"]["payment_method_enum"];
type PaymentStatus = AppDatabase["public"]["Enums"]["payment_status_enum"];

type Transition = { method: PaymentMethod; from: PaymentStatus; to: PaymentStatus };

/** rankが下がるため拒否される遷移。 */
const RANK_DEMOTIONS: Transition[] = [
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

/**
 * rankは上がるが遷移表で拒否される組み合わせ。
 *
 * `canceled` は未集金系からのみ到達でき、かつ終端。`refunded` は決済完了系からのみ到達できる。
 * rank比較しか持たなかった旧トリガーはこの6通りをすべて通していた。
 */
const RULE_VIOLATIONS: Transition[] = [
  { method: "stripe", from: "paid", to: "canceled" },
  { method: "cash", from: "received", to: "canceled" },
  { method: "cash", from: "waived", to: "canceled" },
  { method: "cash", from: "canceled", to: "refunded" },
  { method: "cash", from: "pending", to: "refunded" },
  { method: "stripe", from: "failed", to: "refunded" },
];

/** 追加の列を必要としない昇格。 */
const PROMOTIONS: Transition[] = [
  { method: "cash", from: "pending", to: "canceled" },
  { method: "cash", from: "received", to: "waived" },
  { method: "cash", from: "received", to: "refunded" },
  { method: "stripe", from: "paid", to: "refunded" },
];

describe.each([
  { label: "遅延イベントによる降格", transitions: RANK_DEMOTIONS },
  { label: "遷移表に反する昇格", transitions: RULE_VIOLATIONS },
])("$label", ({ transitions }) => {
  describe.each(transitions)("$method決済の$fromから$to", ({ method, from, to }) => {
    test("への更新を拒否する", async ({ adminClient, payment }) => {
      const created = await payment.createPaymentWithAttendance({ method, status: from });

      const { error } = await adminClient
        .from("payments")
        .update({ status: to })
        .eq("id", created.id);

      expect(error?.code).toBe("P0001");
      expect(error?.message).toContain("Rejecting invalid payment status transition");

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
