/**
 * Payment Completion Guard: 完了済みガード基本動作テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentPort, type PaymentPort } from "@core/ports/payments";

import { CreateStripeSessionParams } from "@features/payments";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("完了済みガード基本動作", () => {
  let setup: PaymentTestSetup;
  let paymentPort: PaymentPort;

  beforeAll(async () => {
    const paymentSetup = await createPaymentTestSetup({
      testName: `completion-guard-test-${Date.now()}`,
      eventFee: 1000,
      accessedTables: ["public.users", "public.events", "public.attendances", "public.payments"],
    });
    setup = paymentSetup;
    paymentPort = getPaymentPort();
  });

  afterAll(async () => {
    try {
      // テスト実行（必要に応じて）
    } finally {
      // 必ずクリーンアップを実行
      await setup.cleanup();
    }
  });

  beforeEach(async () => {
    // 各テスト前に決済データをクリーンアップ
    await setup.adminClient.from("payments").delete().eq("attendance_id", setup.testAttendance.id);
  });

  test("新規決済作成 - 決済記録なし", async () => {
    const sessionParams: CreateStripeSessionParams = {
      attendanceId: setup.testAttendance.id,
      amount: setup.testEvent.fee,
      eventId: setup.testEvent.id,
      actorId: setup.testAttendance.id,
      eventTitle: setup.testEvent.title,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      destinationCharges: {
        destinationAccountId: setup.testUser.stripeConnectAccountId!,
        userEmail: setup.testAttendance.email,
        userName: setup.testAttendance.nickname,
      },
    };

    const result = await paymentPort.createStripeSession(sessionParams);

    expect(result).toHaveProperty("sessionUrl");
    expect(result).toHaveProperty("sessionId");
    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // 作成された決済を確認
    const { data: payment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", setup.testAttendance.id)
      .single();

    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(setup.testEvent.fee);
  });

  test("pending決済の再利用", async () => {
    // pending決済を事前作成
    const { data: pendingPayment } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: setup.testAttendance.id,
        method: "stripe",
        amount: setup.testEvent.fee,
        status: "pending",
      })
      .select()
      .single();

    const sessionParams: CreateStripeSessionParams = {
      attendanceId: setup.testAttendance.id,
      amount: setup.testEvent.fee,
      eventId: setup.testEvent.id,
      actorId: setup.testAttendance.id,
      eventTitle: setup.testEvent.title,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      destinationCharges: {
        destinationAccountId: setup.testUser.stripeConnectAccountId!,
        userEmail: setup.testAttendance.email,
        userName: setup.testAttendance.nickname,
      },
    };

    const result = await paymentPort.createStripeSession(sessionParams);

    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // 既存の決済が再利用されていることを確認
    const { data: payments } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", setup.testAttendance.id);

    expect(payments).toHaveLength(1);
    expect(payments[0].id).toBe(pendingPayment.id);
    expect(payments[0].status).toBe("pending");
  });

  test("failed決済存在時の新規pending作成", async () => {
    // failed決済を事前作成
    const { error: insertError } = await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "failed",
      stripe_payment_intent_id: "pi_test_dummy_failed",
    });

    if (insertError) {
      throw new Error(`Failed to create setup payment: ${insertError.message}`);
    }

    const sessionParams: CreateStripeSessionParams = {
      attendanceId: setup.testAttendance.id,
      amount: setup.testEvent.fee,
      eventId: setup.testEvent.id,
      actorId: setup.testAttendance.id,
      eventTitle: setup.testEvent.title,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      destinationCharges: {
        destinationAccountId: setup.testUser.stripeConnectAccountId!,
        userEmail: setup.testAttendance.email,
        userName: setup.testAttendance.nickname,
      },
    };

    const result = await paymentPort.createStripeSession(sessionParams);

    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // 新規pending決済が作成されていることを確認
    const { data: payments } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", setup.testAttendance.id)
      .order("created_at", { ascending: false });

    expect(payments).toHaveLength(2);
    expect(payments[0].status).toBe("pending"); // 新規作成
    expect(payments[1].status).toBe("failed"); // 既存
  });
});
