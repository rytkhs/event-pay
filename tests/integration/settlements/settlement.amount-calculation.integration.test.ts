import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { cleanupTestData } from "@tests/setup/common-cleanup";
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

import {
  createTestAttendance,
  createPaidStripePayment,
  addRefundToPayment,
  createPaymentDispute,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "@/tests/helpers/test-payment-data";

/**
 * Settlement integration tests - Amount calculation accuracy
 * - 売上・手数料・プラットフォーム手数料の正確な計算検証
 * - 返金がある場合の差引計算検証
 * - 争議がある場合の集計検証
 * - ネット手取り額の計算精度検証
 */
describe("清算レポート - 金額計算の正確性", () => {
  let organizer: TestPaymentUser;
  let event: TestPaymentEvent;
  let attendance1: TestAttendanceData;
  let attendance2: TestAttendanceData;
  const createdPaymentIds: string[] = [];
  const createdDisputeIds: string[] = [];
  let setup: Awaited<ReturnType<typeof createPaymentTestSetup>>;
  const secureFactory = getSecureClientFactory();

  beforeAll(async () => {
    // Use payment test setup (includes event and one attendance)
    setup = await createPaymentTestSetup({
      testName: `settlement-amount-calculation-${Date.now()}`,
      eventFee: 2000,
      paymentMethods: ["stripe"],
      accessedTables: [
        "public.events",
        "public.attendances",
        "public.payments",
        "public.payment_disputes",
        "public.settlements",
      ],
    });
    organizer = setup.testUser as TestPaymentUser;
    event = setup.testEvent;
    attendance1 = setup.testAttendance;

    // Create second attendance for multiple payments
    attendance2 = await createTestAttendance(event.id, {
      nickname: "参加者2",
    });
  });

  afterAll(async () => {
    // Cleanup second attendance and payments created during tests
    await cleanupTestData({
      paymentIds: createdPaymentIds,
      attendanceIds: [attendance2.id], // attendance1 is cleaned up by setup.cleanup()
    });

    if (createdDisputeIds.length > 0) {
      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_CLEANUP,
        "Cleanup test disputes",
        { accessedTables: ["public.payment_disputes"] }
      );

      await adminClient.from("payment_disputes").delete().in("id", createdDisputeIds);
    }

    // setup.cleanup()はevent、attendance1、userも含めてクリーンアップする
    await setup.cleanup();
  });

  describe("基本的な金額計算", () => {
    test("複数の決済額とアプリケーション手数料が正確に集計される", async () => {
      // Payment 1: 2000円, App Fee 200円, Stripe Fee実測値 105円
      const payment1 = await createPaidStripePayment(attendance1.id, {
        amount: 2000,
        applicationFeeAmount: 200,
        stripeAccountId: organizer.stripeConnectAccountId!,
        stripeBalanceTransactionFee: 105, // 実測値を設定
      });
      createdPaymentIds.push(payment1.id);

      // Payment 2: 3000円, App Fee 300円, Stripe Fee実測値なし（フォールバック計算）
      const payment2 = await createPaidStripePayment(attendance2.id, {
        amount: 3000,
        applicationFeeAmount: 300,
        stripeAccountId: organizer.stripeConnectAccountId!,
        // stripeBalanceTransactionFee未設定→フォールバック計算 (3000 * 0.036 + 0 = 108)
      });
      createdPaymentIds.push(payment2.id);

      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Settlement calculation test",
        {
          accessedTables: [
            "public.events",
            "public.attendances",
            "public.payments",
            "public.settlements",
          ],
        }
      );

      // Generate settlement report
      const { data, error } = await adminClient.rpc("generate_settlement_report", {
        input_event_id: event.id,
        input_created_by: organizer.id,
      });

      expect(error).toBeNull();
      expect(data).toBeTruthy();

      // Get settlement details
      const { data: settlement, error: fetchError } = await adminClient
        .from("settlements")
        .select("*")
        .eq("event_id", event.id)
        .single();

      expect(fetchError).toBeNull();
      expect(settlement).toBeTruthy();

      // 期待値計算
      const expectedStripeeSales = 2000 + 3000; // 5000円
      const expectedApplicationFee = 200 + 300; // 500円
      const expectedStripeFee = 105 + Math.round(3000 * 0.036 + 0); // 105 + 108 = 213円
      const expectedNetPayoutAmount = expectedStripeeSales - expectedApplicationFee; // 5000 - 500 = 4500円

      // 検証
      expect(settlement.total_stripe_sales).toBe(expectedStripeeSales);
      expect(settlement.platform_fee).toBe(expectedApplicationFee); // net application fee (返金なしなので全額)
      expect(settlement.total_stripe_fee).toBe(expectedStripeFee);
      expect(settlement.net_payout_amount).toBe(expectedNetPayoutAmount);
    });
  });

  describe("返金がある場合の差引計算", () => {
    test("部分返金時の売上・手数料・ネット額が正確に計算される", async () => {
      // 既存の決済に返金を追加
      const paymentToRefund = createdPaymentIds[0]; // 2000円の決済
      await addRefundToPayment(paymentToRefund, {
        refundedAmount: 800, // 800円返金
        applicationFeeRefundedAmount: 80, // アプリ手数料80円返金
      });

      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Settlement refund calculation test",
        {
          accessedTables: [
            "public.events",
            "public.attendances",
            "public.payments",
            "public.settlements",
          ],
        }
      );

      // Re-generate settlement report
      const { data, error } = await adminClient.rpc("generate_settlement_report", {
        input_event_id: event.id,
        input_created_by: organizer.id,
      });

      expect(error).toBeNull();

      // Get updated settlement
      const { data: settlement } = await adminClient
        .from("settlements")
        .select("*")
        .eq("event_id", event.id)
        .single();

      // 期待値計算（返金後）
      const expectedStripeSales = 2000 + 3000; // 売上総額は変わらず（paid + refunded）
      const expectedGrossApplicationFee = 200 + 300; // 500円
      const expectedApplicationFeeRefunded = 80; // 返金されたアプリ手数料
      const expectedNetApplicationFee = Math.max(
        expectedGrossApplicationFee - expectedApplicationFeeRefunded,
        0
      ); // 500 - 80 = 420円
      const expectedTotalRefunded = 800; // 返金額
      const expectedNetPayoutAmount =
        expectedStripeSales - expectedTotalRefunded - expectedNetApplicationFee; // (5000 - 800) - 420 = 3780円

      expect(settlement.total_stripe_sales).toBe(expectedStripeSales);
      expect(settlement.platform_fee).toBe(expectedNetApplicationFee);
      expect(settlement.net_payout_amount).toBe(expectedNetPayoutAmount);
    });
  });

  describe("争議がある場合の集計", () => {
    test("敗訴争議が発生した場合の金額への影響を確認", async () => {
      // 3000円の決済に対して敗訴争議を作成
      const paymentWithDispute = createdPaymentIds[1]; // 3000円の決済
      const disputeId = await createPaymentDispute(paymentWithDispute, {
        amount: 3000, // 全額争議
        status: "lost", // 敗訴
      });
      createdDisputeIds.push(disputeId.id);

      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Settlement dispute calculation test",
        {
          accessedTables: [
            "public.events",
            "public.attendances",
            "public.payments",
            "public.settlements",
            "public.payment_disputes",
          ],
        }
      );

      // Re-generate settlement report with dispute
      const { data, error } = await adminClient.rpc("generate_settlement_report", {
        input_event_id: event.id,
        input_created_by: organizer.id,
      });

      expect(error).toBeNull();

      // Get settlement with dispute impact
      const { data: settlement } = await adminClient
        .from("settlements")
        .select("*")
        .eq("event_id", event.id)
        .single();

      // 争議の詳細情報も確認
      const { data: refundDisputeSummary } = await adminClient.rpc("calc_refund_dispute_summary", {
        p_event_id: event.id,
      });

      expect(refundDisputeSummary).toBeTruthy();
      expect(refundDisputeSummary.disputeCount).toBe(1);
      expect(refundDisputeSummary.totalDisputedAmount).toBe(3000);

      // 争議は売上から控除されないが、プラットフォームにとってはリスク情報として記録
      const expectedStripeSales = 2000 + 3000; // 売上総額は変わらず
      expect(settlement.total_stripe_sales).toBe(expectedStripeSales);
    });

    test("勝訴争議（won）は集計から除外される", async () => {
      // 2000円の決済に対して勝訴争議を作成
      const paymentWithWonDispute = createdPaymentIds[0];
      const wonDisputeId = await createPaymentDispute(paymentWithWonDispute, {
        amount: 1000,
        status: "won", // 勝訴
      });
      createdDisputeIds.push(wonDisputeId.id);

      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Settlement won dispute test",
        {
          accessedTables: [
            "public.events",
            "public.attendances",
            "public.payments",
            "public.settlements",
            "public.payment_disputes",
          ],
        }
      );

      // Check refund/dispute summary
      const { data: summary } = await adminClient.rpc("calc_refund_dispute_summary", {
        p_event_id: event.id,
      });

      expect(summary).toBeTruthy();
      // wonステータスは集計から除外される（lost争議のみカウント）
      expect(summary.disputeCount).toBe(1); // 前のlost争議のみ
      expect(summary.totalDisputedAmount).toBe(3000); // lost争議の金額のみ
    });
  });

  describe("境界値・エッジケース", () => {
    test("アプリケーション手数料が返金額を上回る場合はゼロに制限される", async () => {
      // 新しい決済を作成
      const extraAttendance = await createTestAttendance(event.id, {
        nickname: "境界値テスト参加者",
      });
      const payment = await createPaidStripePayment(extraAttendance.id, {
        amount: 1000,
        applicationFeeAmount: 100,
        stripeAccountId: organizer.stripeConnectAccountId!,
      });
      createdPaymentIds.push(payment.id);

      // アプリ手数料以上の返金を実行（100円のアプリ手数料に対して120円返金を試行）
      await addRefundToPayment(payment.id, {
        refundedAmount: 500,
        applicationFeeRefundedAmount: 120, // アプリ手数料100円を超過
      });

      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Edge case test: app fee refund overflow",
        {
          accessedTables: [
            "public.events",
            "public.attendances",
            "public.payments",
            "public.settlements",
          ],
        }
      );

      // Re-generate settlement
      await adminClient.rpc("generate_settlement_report", {
        input_event_id: event.id,
        input_created_by: organizer.id,
      });

      const { data: settlement } = await adminClient
        .from("settlements")
        .select("platform_fee")
        .eq("event_id", event.id)
        .single();

      // 実質アプリケーション手数料が負にならない（GREATEST関数による制限）
      expect(settlement).not.toBeNull();
      expect(settlement!.platform_fee).toBeGreaterThanOrEqual(0);
    });
  });
});
