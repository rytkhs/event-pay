/**
 * Payment Completion Guard: 並行処理・競合対策テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentService } from "@core/services";
import { CreateStripeSessionParams } from "@features/payments/types";

// PaymentService実装の確実な登録
import "@features/payments/core-bindings";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("並行処理・競合対策", () => {
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

  test("一意制約違反時の再試行メカニズム", async () => {
    // 並行作成をシミュレートするため、同じattendance_idでpending決済を複数作成試行
    // （実際の一意制約により2回目以降は制約違反になる）

    // 最初の決済を作成
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "pending",
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

    // 2回目の呼び出しでも成功する（既存のpending決済を再利用）
    const result = await paymentService.createStripeSession(sessionParams);
    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // 決済レコードは1つのままであることを確認
    const { data: payments } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", setup.testAttendance.id);

    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("pending");
  });
});
