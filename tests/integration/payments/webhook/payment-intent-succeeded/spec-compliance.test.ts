/**
 * payment_intent.succeeded Webhook: 仕様書準拠性検証テスト
 *
 * このファイルは、payment_intent.succeeded Webhook処理の実装が
 * 仕様書の要求事項に準拠しているかを検証するテストです。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { POST as WorkerPOST } from "@/app/api/workers/stripe-webhook/route";
import { createPendingTestPayment } from "@/tests/helpers/test-payment-data";
import type { Database } from "@/types/database";

import {
  setupPaymentIntentSucceededTest,
  setupBeforeEach,
  type PaymentIntentSucceededTestSetup,
} from "./payment-intent-succeeded-test-setup";

describe("📋 仕様書準拠性検証", () => {
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

  describe("決済レコード特定方法の仕様準拠", () => {
    it("stripe_payment_intent_idによる特定が最優先であること", async () => {
      /**
       * 仕様書要求:
       * - stripe_payment_intent_id が存在する場合、これを最優先で使用
       * - metadata.payment_id はフォールバックとして使用
       */
      const paymentIntentId = `pi_spec_priority_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      // stripe_payment_intent_id を事前に設定
      await setup.supabase
        .from("payments")
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq("id", payment.id);

      // metadata.payment_id は異なるIDを設定（優先順位テストのため）
      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: {
          payment_id: "different_payment_id_should_be_ignored",
          attendance_id: setup.testAttendance.id,
          event_title: setup.testEvent.title,
        },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);

      // stripe_payment_intent_id が最優先で適用され、対象決済が更新されること
      const { data: updatedPayment } = await setup.supabase
        .from("payments")
        .select("status, webhook_event_id, stripe_payment_intent_id")
        .eq("id", payment.id)
        .single();
      expect(updatedPayment.status).toBe("paid");
      expect(updatedPayment.webhook_event_id).toBe(evt.id);
      expect(updatedPayment.stripe_payment_intent_id).toBe(paymentIntentId);
    });

    it("metadata.payment_idによるフォールバック検索が機能すること", async () => {
      /**
       * 仕様書要求:
       * - stripe_payment_intent_id が存在しない場合、metadata.payment_id を使用
       */
      const paymentIntentId = `pi_spec_fallback_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      // stripe_payment_intent_id は設定しない
      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: {
          payment_id: payment.id,
          attendance_id: setup.testAttendance.id,
          event_title: setup.testEvent.title,
        },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);

      // stripe_payment_intent_id が更新されていること
      const { data: updatedPayment } = await setup.supabase
        .from("payments")
        .select("stripe_payment_intent_id")
        .eq("id", payment.id)
        .single();
      expect(updatedPayment.stripe_payment_intent_id).toBe(paymentIntentId);
    });
  });

  describe("ステータス更新の仕様準拠", () => {
    it("pending → paid へのステータス更新が仕様書通りであること", async () => {
      /**
       * 仕様書要求:
       * - payment_intent.succeeded イベント受信時、status を pending → paid に更新
       * - paid_at タイムスタンプを記録
       * - webhook_event_id を保存
       * - webhook_processed_at を記録
       * - updated_at を更新
       * - stripe_payment_intent_id を保存
       */
      const paymentIntentId = `pi_spec_status_update_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      // 初期状態の確認
      expect(payment.status).toBe("pending");
      expect(payment.paid_at).toBeNull();

      const eventId = `evt_spec_${Date.now()}`;
      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: { payment_id: payment.id },
      });
      evt.id = eventId;

      const beforeTime = new Date().toISOString();

      const { POST: WorkerPOST } = await import("@/app/api/workers/stripe-webhook/route");
      const req = setup.createRequest({ event: evt });
      await WorkerPOST(req);

      const afterTime = new Date().toISOString();

      // 仕様書で定義されたフィールドが正しく更新されているか確認
      const { data: updatedPayment } = await setup.supabase
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      // ステータス更新
      expect(updatedPayment.status).toBe("paid");

      // paid_at タイムスタンプ
      expect(updatedPayment.paid_at).toBeTruthy();
      const paidAtTime = new Date(updatedPayment.paid_at).getTime();
      expect(paidAtTime).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
      expect(paidAtTime).toBeLessThanOrEqual(new Date(afterTime).getTime());

      // webhook_event_id
      expect(updatedPayment.webhook_event_id).toBe(eventId);

      // webhook_processed_at
      expect(updatedPayment.webhook_processed_at).toBeTruthy();
      const processedAtTime = new Date(updatedPayment.webhook_processed_at).getTime();
      expect(processedAtTime).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());

      // updated_at
      expect(updatedPayment.updated_at).toBeTruthy();
      const updatedAtTime = new Date(updatedPayment.updated_at).getTime();
      expect(updatedAtTime).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());

      // stripe_payment_intent_id
      expect(updatedPayment.stripe_payment_intent_id).toBe(paymentIntentId);
    });
  });

  describe("ステータスランク値の実装準拠", () => {
    it("ステータスランク値が仕様書通りであること", async () => {
      /**
       * 仕様書要求:
       * - 各ステータスにランク値が定義されている
       * - 実装が仕様書のランク値と一致していること
       */
      const { statusRank } = await import("@core/utils/payments/status-rank");

      const expectedRanks = {
        pending: 10,
        failed: 15,
        paid: 20,
        received: 20, // paidと同じランク
        waived: 25,
        canceled: 35,
        refunded: 40,
      };

      Object.entries(expectedRanks).forEach(([status, rank]) => {
        expect(statusRank(status as any)).toBe(rank);
      });
    });
  });

  describe("実装ファイルパスの確認", () => {
    it("実装ファイルが期待通りに存在すること", async () => {
      /**
       * 仕様書準拠:
       * - Webhook処理の実装ファイルが存在すること
       * - ステータスランク処理の実装ファイルが存在すること
       */
      const webhookHandler = await import(
        "@/features/payments/services/webhook/webhook-event-handler"
      );
      expect(webhookHandler.StripeWebhookEventHandler).toBeDefined();

      const statusRank = await import("@core/utils/payments/status-rank");
      expect(statusRank.statusRank).toBeDefined();
      expect(statusRank.canPromoteStatus).toBeDefined();
    });
  });

  describe("データベーススキーマ型定義の準拠", () => {
    it("データベーススキーマ型定義が期待通りであること", () => {
      /**
       * 仕様書準拠:
       * - データベーススキーマの型定義が正しくインポートできること
       * - payment_status_enum が期待通りに定義されていること
       */
      type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];
      type PaymentTable = Database["public"]["Tables"]["payments"];

      // 型が正しくインポートできることを確認
      const mockPaymentStatus: PaymentStatus = "paid";
      expect(mockPaymentStatus).toBe("paid");

      // テーブル型が存在することを確認
      const _mockPayment: PaymentTable["Row"] = {} as any;
      expect(_mockPayment).toBeDefined();
    });
  });

  describe("エラーハンドリングの仕様準拠", () => {
    it("決済レコードが見つからない場合のエラーハンドリング", async () => {
      /**
       * 仕様書要求:
       * - 決済レコードが見つからない場合、適切なエラーレスポンスを返す
       * - エラーログを記録する
       */
      const paymentIntentId = `pi_spec_not_found_${Date.now()}`;
      const evt = setup.createPaymentIntentEvent(paymentIntentId, {
        metadata: {
          payment_id: "non_existent_payment_id",
          attendance_id: setup.testAttendance.id,
          event_title: setup.testEvent.title,
        },
      });

      const req = setup.createRequest({ event: evt });
      const res = await WorkerPOST(req);

      // 決済レコード未発見でもACKして再試行を止める（冪等性）
      expect(res.status).toBe(204);
    });
  });
});
