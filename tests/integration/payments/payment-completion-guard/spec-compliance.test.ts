/**
 * Payment Completion Guard: 仕様書適合性検証テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentService } from "@core/services";
import { PaymentErrorType } from "@core/types/payment-errors";
import { statusRank } from "@core/utils/payments/status-rank";

import { CreateStripeSessionParams } from "@features/payments";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

const SPEC_STATUS_RANKS = {
  pending: 10,
  failed: 15,
  paid: 20,
  received: 20, // paidと同じランク（両方とも「支払い完了」状態）
  waived: 25,
  canceled: 35,
  refunded: 40,
} as const;

describe("仕様書適合性検証", () => {
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

  test("ステータスランク値が仕様書通りであること", () => {
    // 仕様書の期待値と実装を比較
    Object.entries(SPEC_STATUS_RANKS).forEach(([status, expectedRank]) => {
      const actualRank = statusRank(status as any);
      expect(actualRank).toBe(expectedRank);
    });
  });

  test("終端系ステータスの定義が仕様書通りであること - CRITICAL TEST", async () => {
    // waived状態の決済を作成
    const { data: waivedPayment, error: insertError } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: setup.testAttendance.id,
        method: "cash",
        amount: setup.testEvent.fee,
        status: "waived",
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    console.log(`✓ waived決済作成: ${waivedPayment.id}`);

    // 新規決済セッション作成を試行
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

    // 仕様書によれば、waivedは終端系なので完了済みガードが作動すべき
    await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
      expect.objectContaining({
        type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        message: "この参加に対する決済は既に完了済みです",
      })
    );
  });
});
