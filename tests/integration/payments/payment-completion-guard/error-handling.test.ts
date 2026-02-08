/**
 * Payment Completion Guard: エラーハンドリングテスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentPort, type PaymentPort } from "@core/ports/payments";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { CreateStripeSessionParams } from "@features/payments";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("エラーハンドリング", () => {
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

  test("PaymentError.PAYMENT_ALREADY_EXISTS の詳細", async () => {
    // paid決済を作成
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: "pi_test_error_details",
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

    try {
      await paymentPort.createStripeSession(sessionParams);
      fail("PaymentError should be thrown");
    } catch (error) {
      const paymentError = error as PaymentError;
      expect(paymentError).toBeInstanceOf(PaymentError);
      expect(paymentError.type).toBe(PaymentErrorType.PAYMENT_ALREADY_EXISTS);
      expect(paymentError.message).toBe("この参加に対する決済は既に完了済みです");
      expect(paymentError.name).toBe("PaymentError");
    }
  });
});
