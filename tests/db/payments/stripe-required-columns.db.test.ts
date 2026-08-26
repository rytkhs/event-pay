import { describe, expect } from "vitest";

import { test } from "../../fixtures/payment";

/**
 * PAY-03: 非pending / 非canceledのStripe PaymentにはPaymentIntent IDが必要である。
 * PAY-04: Stripe Paymentには`payout_profile_id`が必要である。
 *
 * どちらもStripe決済の突合と入金先の追跡可能性を守る制約で、
 * 現金決済には課されない。
 */

describe("PaymentIntent ID", () => {
  describe.each(["failed", "paid", "waived", "refunded"] as const)("%sのStripe決済", (status) => {
    test("PaymentIntent IDなしでは作成できない", async ({ adminClient, payment }) => {
      const attendance = await payment.createAttendance();

      const { error } = await adminClient.from("payments").insert(
        payment.buildPayment({
          attendanceId: attendance.id,
          method: "stripe",
          status,
          stripe_payment_intent_id: null,
        })
      );

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain("payments_stripe_intent_required");
    });
  });

  describe.each(["pending", "canceled"] as const)("%sのStripe決済", (status) => {
    test("PaymentIntent IDなしで作成できる", async ({ payment }) => {
      const created = await payment.createPaymentWithAttendance({ method: "stripe", status });

      expect(created.status).toBe(status);
      expect(created.stripePaymentIntentId).toBeNull();
    });
  });

  test("PaymentIntent IDのないStripe決済は失敗状態へ更新できない", async ({
    adminClient,
    payment,
  }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "pending",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ status: "failed" })
      .eq("id", created.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_stripe_intent_required");

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.status).toBe("pending");
  });

  test("PaymentIntent IDを付与すれば失敗状態へ更新できる", async ({ adminClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "pending",
    });
    const intentId = payment.stripeIntentId("late-failure");

    const { error } = await adminClient
      .from("payments")
      .update({ status: "failed", stripe_payment_intent_id: intentId })
      .eq("id", created.id);

    expect(error).toBeNull();

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.status).toBe("failed");
    expect(snapshot.stripePaymentIntentId).toBe(intentId);
  });

  test("支払済みStripe決済のPaymentIntent IDをNULLにできない", async ({ adminClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "paid",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ stripe_payment_intent_id: null })
      .eq("id", created.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_stripe_intent_required");

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.stripePaymentIntentId).toBe(created.stripePaymentIntentId);
  });

  test("現金決済はPaymentIntent IDなしで免除にできる", async ({ payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "cash",
      status: "waived",
    });

    expect(created.status).toBe("waived");
    expect(created.stripePaymentIntentId).toBeNull();
  });
});

describe("受取先プロファイル", () => {
  test("受取先プロファイルのないStripe決済は作成できない", async ({ adminClient, payment }) => {
    const attendance = await payment.createAttendance();

    const { error } = await adminClient.from("payments").insert(
      payment.buildPayment({
        attendanceId: attendance.id,
        method: "stripe",
        status: "pending",
        payout_profile_id: null,
      })
    );

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_payout_profile_required_for_stripe");
  });

  test("受取先プロファイルを持つStripe決済は作成できる", async ({ payment, payoutProfile }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "pending",
    });

    expect(created.payoutProfileId).toBe(payoutProfile.id);
  });

  test("現金決済は受取先プロファイルなしで作成できる", async ({ cashPayment }) => {
    expect(cashPayment.method).toBe("cash");
    expect(cashPayment.payoutProfileId).toBeNull();
  });

  test("Stripe決済の受取先プロファイルをNULLへ更新できない", async ({ adminClient, payment }) => {
    const created = await payment.createPaymentWithAttendance({
      method: "stripe",
      status: "pending",
    });

    const { error } = await adminClient
      .from("payments")
      .update({ payout_profile_id: null })
      .eq("id", created.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_payout_profile_required_for_stripe");

    const snapshot = await payment.readPayment(created.id);
    expect(snapshot.payoutProfileId).toBe(created.payoutProfileId);
  });

  test("現金決済をStripeへ変更するには受取先プロファイルが必要", async ({
    adminClient,
    cashPayment,
    payment,
  }) => {
    const { error } = await adminClient
      .from("payments")
      .update({ method: "stripe" })
      .eq("id", cashPayment.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payments_payout_profile_required_for_stripe");

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.method).toBe("cash");
  });
});
