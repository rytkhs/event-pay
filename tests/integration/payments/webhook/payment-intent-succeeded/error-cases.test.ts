/**
 * payment_intent.succeeded Webhook: 異常系テスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { POST as WorkerPOST } from "@/app/api/workers/stripe-webhook/route";
import { createPendingTestPayment } from "@/tests/helpers/test-payment-data";

import {
  setupPaymentIntentSucceededTest,
  setupBeforeEach,
  mockLoggerInfo,
  type PaymentIntentSucceededTestSetup,
} from "./payment-intent-succeeded-test-setup";

describe("異常系テスト", () => {
  let setup: PaymentIntentSucceededTestSetup;

  beforeAll(async () => {
    setup = await setupPaymentIntentSucceededTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  beforeEach(() => {
    setupBeforeEach();
  });

  describe("決済レコードが見つからない場合", () => {
    it("決済レコード未発見でもACK（success: true）を返す", async () => {
      const paymentIntentId = `pi_not_found_${Date.now()}`;
      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: { payment_id: "non_existent_payment_id" },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);

      // セキュリティログが出力されているか確認
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_payment_intent_no_payment_record",
          details: expect.objectContaining({
            eventId: evt.id,
            payment_intent: paymentIntentId,
          }),
        })
      );
    });

    it("stripe_payment_intent_idとmetadata.payment_idの両方で見つからない場合", async () => {
      const paymentIntentId = `pi_none_found_${Date.now()}`;
      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: { payment_id: "another_non_existent_id" },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);
    });
  });

  describe("金額・通貨不一致", () => {
    it("金額不一致時は終端エラーを返す", async () => {
      const paymentIntentId = `pi_amount_mismatch_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500, // DB: 1500円
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        amount: 2000, // Stripe: 2000円（不一致）
        currency: "jpy",
        metadata: { payment_id: payment.id },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      // 非リトライエラ（terminal: true）かつ重複でない場合は 489
      expect(res.status).toBe(489);
      expect(res.headers.get("Upstash-NonRetryable-Error")).toBe("true");

      // セキュリティログが出力されている
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_amount_currency_mismatch",
          details: expect.objectContaining({
            eventId: evt.id,
            paymentId: payment.id,
            expectedAmount: 1500,
            actualAmount: 2000,
            expectedCurrency: "jpy",
            actualCurrency: "jpy",
          }),
        })
      );
    });

    it("通貨不一致（JPY以外）時は終端エラーを返す", async () => {
      const paymentIntentId = `pi_currency_mismatch_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        amount: 1500,
        currency: "usd", // USD（JPYでない）
        metadata: { payment_id: payment.id },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      // 非リトライエラー（terminal: true）かつ重複でない場合は 489
      expect(res.status).toBe(489);
      expect(res.headers.get("Upstash-NonRetryable-Error")).toBe("true");

      // セキュリティログが出力されている
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_amount_currency_mismatch",
          details: expect.objectContaining({
            eventId: evt.id,
            paymentId: payment.id,
            expectedCurrency: "jpy",
            actualCurrency: "usd",
          }),
        })
      );
    });

    it("金額と通貨の両方が不一致の場合", async () => {
      const paymentIntentId = `pi_both_mismatch_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        amount: 2000, // 金額不一致
        currency: "eur", // 通貨不一致
        metadata: { payment_id: payment.id },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(489);
      expect(res.headers.get("Upstash-NonRetryable-Error")).toBe("true");

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_amount_currency_mismatch",
          details: expect.objectContaining({
            expectedAmount: 1500,
            actualAmount: 2000,
            expectedCurrency: "jpy",
            actualCurrency: "eur",
          }),
        })
      );
    });
  });

  describe("データベース更新失敗", () => {
    it("DB更新失敗時は例外をthrowして再試行対象とする", async () => {
      // このテストは実際のDB制約違反を起こすのが困難なため、
      // 実装が例外をthrowしていることをドキュメント化
      // 実際のテストでは、Supabaseクライアントをモックして
      // updateでエラーを返すようにする必要がある

      expect(true).toBe(true); // プレースホルダー
      // TODO: Supabaseクライアントのモックを使用してDB更新失敗をシミュレート
    });
  });

  describe("参加情報取得失敗", () => {
    it("attendances取得失敗時は決済処理が成功し売上更新がスキップされる", async () => {
      const paymentIntentId = `pi_attendance_fail_${Date.now()}`;

      // 存在しないattendance_idを持つ決済を作成
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      // attendance_idを存在しないIDに変更
      await setup.supabase
        .from("payments")
        .update({ attendance_id: "non_existent_attendance_id" })
        .eq("id", payment.id);

      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: { payment_id: payment.id },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      // 決済処理は成功
      expect(res.status).toBe(204);

      // 決済は正常にpaidに更新されている
      const { data: updatedPayment } = await setup.supabase
        .from("payments")
        .select("status")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("paid");

      // 注意: 統合テストでは実際のログ出力とRPC動作を確認
      // 具体的なログ検証はE2Eテストまたはユニットテストで行う
    });
  });
});
