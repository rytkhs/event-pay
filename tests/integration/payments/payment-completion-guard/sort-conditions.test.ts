/**
 * Payment Completion Guard: ソート条件の検証テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentService } from "@core/services";
import { PaymentErrorType } from "@core/types/payment-errors";
import { CreateStripeSessionParams } from "@features/payments/types";

// PaymentService実装の確実な登録
import "@features/payments/core-bindings";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("ソート条件の検証", () => {
  let setup: PaymentTestSetup;
  let paymentService: ReturnType<typeof getPaymentService>;

  beforeAll(async () => {
    const paymentSetup = await createPaymentTestSetup({
      testName: `completion-guard-test-${Date.now()}`,
      eventFee: 1000,
      accessedTables: ["public.users", "public.events", "public.attendances", "public.payments"],
    });
    setup = paymentSetup;
    paymentService = getPaymentService();
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

  test("終端決済のソート順序: paid_at DESC, created_at DESC", async () => {
    const baseTime = new Date();
    const time1 = new Date(baseTime.getTime() - 120000); // 2分前
    const time2 = new Date(baseTime.getTime() - 90000); // 1.5分前
    const time3 = new Date(baseTime.getTime() - 60000); // 1分前

    // 複数の終端決済を異なる時刻で作成
    // 最初に作成（古いpaid_at）
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      paid_at: time1.toISOString(),
      created_at: time1.toISOString(),
      stripe_payment_intent_id: "pi_test_sort_1",
    });

    // 2番目に作成（新しいpaid_at）- これが取得される
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      paid_at: time3.toISOString(), // 最新
      created_at: time2.toISOString(),
      stripe_payment_intent_id: "pi_test_sort_2",
    });

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

    // 最新のpaid_atを持つ決済が使用されるため拒否される
    await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
      expect.objectContaining({
        type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
      })
    );
  });

  test("オープン決済のソート順序: pending優先, updated_at DESC, created_at DESC", async () => {
    const baseTime = new Date();
    const time1 = new Date(baseTime.getTime() - 120000); // 2分前
    const time2 = new Date(baseTime.getTime() - 60000); // 1分前

    // failed決済（古い）
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "failed",
      created_at: time2.toISOString(),
      updated_at: time2.toISOString(),
    });

    // pending決済（古いが、failedより優先される）
    const { data: pendingPayment } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: setup.testAttendance.id,
        method: "stripe",
        amount: setup.testEvent.fee,
        status: "pending",
        created_at: time1.toISOString(), // failedより古い
        updated_at: time1.toISOString(),
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

    // pending決済が優先的に再利用される
    const result = await paymentService.createStripeSession(sessionParams);
    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // pendingが再利用され、failedは触れられていないことを確認
    const { data: payments } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", setup.testAttendance.id)
      .order("created_at", { ascending: false });

    expect(payments).toHaveLength(2);

    // pending決済のStripe識別子がリセットされていることを確認（再利用の証拠）
    const updatedPending = payments.find((p) => p.id === pendingPayment.id);
    expect(updatedPending.stripe_checkout_session_id).toBeNull();
    expect(updatedPending.stripe_payment_intent_id).toBeNull();

    // failed決済は変更されていない
    const failedPayment = payments.find((p) => p.status === "failed");
    expect(failedPayment).toBeDefined();
  });
});
