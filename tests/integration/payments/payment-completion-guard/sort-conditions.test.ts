/**
 * Payment Completion Guard: ソート条件の検証テスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { getPaymentPort, type PaymentPort } from "@core/ports/payments";
import { PaymentErrorType } from "@core/types/payment-errors";

import { CreateStripeSessionParams } from "@features/payments";

import { createPaymentTestSetup, type PaymentTestSetup } from "@tests/setup/common-test-setup";

describe("ソート条件の検証", () => {
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
    await expect(paymentPort.createStripeSession(sessionParams)).rejects.toThrow(
      expect.objectContaining({
        type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
      })
    );
  });

  test("オープン決済のソート順序: 有効日時(updated_at)が新しいものを優先", async () => {
    const baseTime = new Date();
    const timeOld = new Date(baseTime.getTime() - 120000); // 2分前（古い）
    const timeNew = new Date(baseTime.getTime() - 60000); // 1分前（新しい）

    // failed決済（古くする）
    const { error: insertError } = await setup.adminClient.from("payments").insert({
      attendance_id: setup.testAttendance.id,
      method: "stripe",
      amount: setup.testEvent.fee,
      status: "failed",
      created_at: timeOld.toISOString(),
      updated_at: timeOld.toISOString(),
      stripe_checkout_session_id: "cs_test_dummy_failed", // 制約回避のためのダミーID
      stripe_payment_intent_id: "pi_test_dummy_failed",
      checkout_idempotency_key: "idemp_failed_key",
      checkout_key_revision: 0,
    });

    if (insertError) {
      console.error("Failed to insert failed payment:", insertError);
      throw insertError;
    }

    // pending決済（failedより新しくする -> こちらが選ばれるはず）
    const { data: pendingPayment, error: pendingInsertError } = await setup.adminClient
      .from("payments")
      .insert({
        attendance_id: setup.testAttendance.id,
        method: "stripe",
        amount: setup.testEvent.fee,
        status: "pending",
        created_at: timeNew.toISOString(), // failedより新しい
        updated_at: timeNew.toISOString(),
        stripe_checkout_session_id: "cs_test_dummy_pending", // 再利用時にリセットされるはず
        stripe_payment_intent_id: "pi_test_dummy_pending",
        checkout_idempotency_key: "idemp_pending_key",
        checkout_key_revision: 0,
      })
      .select()
      .single();

    if (pendingInsertError) {
      console.error("Failed to insert pending payment:", pendingInsertError);
      throw pendingInsertError;
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

    // pending決済（最新）が優先的に再利用される
    const result = await paymentPort.createStripeSession(sessionParams);
    expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    // pendingが再利用され、failedは触れられていないことを確認
    const { data: payments } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", setup.testAttendance.id)
      .order("created_at", { ascending: false });

    // 合計2件（failed + pending）であること
    expect(payments).toHaveLength(2);

    // 最新の決済はpending（再利用されたもの）であること
    expect(payments[0].id).toBe(pendingPayment.id);
    expect(payments[0].status).toBe("pending");

    // pending決済のStripe識別子が更新されていることを確認（再利用され、新しいセッションIDになっている）
    const updatedPending = payments.find((p: any) => p.id === pendingPayment.id);
    expect(updatedPending).toBeDefined();

    if (!updatedPending) {
      throw new Error("Updated pending payment not found");
    }
    // 古いダミーIDとは異なる、新しいセッションIDが入っているはず
    expect(updatedPending.stripe_checkout_session_id).not.toBe("cs_test_dummy_pending");
    expect(updatedPending.stripe_checkout_session_id).toMatch(/^cs_test_/);

    // PaymentIntentIDはCheckout作成時点ではnullのまま(webhook等で入る想定)
    expect(updatedPending.stripe_payment_intent_id).toBeNull();
  });
});
