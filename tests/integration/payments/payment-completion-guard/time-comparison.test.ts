/**
 * Payment Completion Guard: 時間比較ロジックテスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentService } from "@core/services";
import { PaymentErrorType } from "@core/types/payment-errors";
import { CreateStripeSessionParams } from "@features/payments/types";

// PaymentService実装の確実な登録
import "@features/payments/core-bindings";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("時間比較ロジック", () => {
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

  test("終端決済が新しい場合の拒否", async () => {
    const now = new Date();
    const olderTime = new Date(now.getTime() - 60000); // 1分前
    const newerTime = new Date(now.getTime() - 30000); // 30秒前

    // 古いpending決済を作成
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "pending",
      created_at: olderTime.toISOString(),
      updated_at: olderTime.toISOString(),
    });

    // 新しいpaid決済を作成
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      paid_at: newerTime.toISOString(),
      created_at: newerTime.toISOString(),
      updated_at: newerTime.toISOString(),
      stripe_payment_intent_id: "pi_test_newer_paid",
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

    await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
      expect.objectContaining({
        type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        message: "この参加に対する決済は既に完了済みです",
      })
    );
  });

  test("オープン決済が新しい場合の許可", async () => {
    const now = new Date();
    const olderTime = new Date(now.getTime() - 60000); // 1分前
    const newerTime = new Date(now.getTime() - 30000); // 30秒前

    // 古いpaid決済を作成
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      paid_at: olderTime.toISOString(),
      created_at: olderTime.toISOString(),
      updated_at: olderTime.toISOString(),
      stripe_payment_intent_id: "pi_test_older_paid",
    });

    // 新しいpending決済を作成
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "pending",
      created_at: newerTime.toISOString(),
      updated_at: newerTime.toISOString(),
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

    // エラーではなく成功することを期待
    const result = await paymentService.createStripeSession(sessionParams);
    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });

  test("時間比較の優先順位 - 終端決済: paid_at > updated_at > created_at", async () => {
    const baseTime = new Date();
    const time1 = new Date(baseTime.getTime() - 90000); // 90秒前
    const time2 = new Date(baseTime.getTime() - 60000); // 60秒前
    const time3 = new Date(baseTime.getTime() - 30000); // 30秒前
    const time4 = new Date(baseTime.getTime() - 15000); // 15秒前（最新）

    // pending決済（比較対象）
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "pending",
      created_at: time2.toISOString(),
      updated_at: time2.toISOString(),
    });

    // 終端決済：created_at < updated_at < paid_at の順で設定
    // paid_atが最新なので、これが比較に使用されるべき
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      created_at: time1.toISOString(), // 最も古い
      updated_at: time3.toISOString(), // 中間
      paid_at: time4.toISOString(), // 最新（これが使用される）
      stripe_payment_intent_id: "pi_test_time_priority",
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

    // paid_at（time4）がpendingのupdated_at（time2）より新しいので拒否される
    await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
      expect.objectContaining({
        type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        message: "この参加に対する決済は既に完了済みです",
      })
    );
  });

  test("時間比較の優先順位 - オープン決済: updated_at > created_at", async () => {
    const baseTime = new Date();
    const time1 = new Date(baseTime.getTime() - 60000); // 60秒前
    const time2 = new Date(baseTime.getTime() - 30000); // 30秒前
    const time3 = new Date(baseTime.getTime() - 45000); // 45秒前

    // 終端決済（比較対象）
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "paid",
      paid_at: time3.toISOString(), // 45秒前
      created_at: time1.toISOString(),
      updated_at: time1.toISOString(),
      stripe_payment_intent_id: "pi_test_open_time_priority",
    });

    // オープン決済：created_at < updated_at の順で設定
    // updated_atが最新なので、これが比較に使用されるべき
    await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "pending",
      created_at: time1.toISOString(), // 古い
      updated_at: time2.toISOString(), // 新しい（これが使用される）
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

    // pendingのupdated_at（time2: 30秒前）が終端のpaid_at（time3: 45秒前）より新しいので許可される
    const result = await paymentService.createStripeSession(sessionParams);
    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });
});
