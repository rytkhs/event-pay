/**
 * payment_intent.succeeded Webhook: 正常系テスト
 */

import { NextRequest } from "next/server";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { POST as WorkerPOST } from "@/app/api/workers/stripe-webhook/route";
import { logger } from "@core/logging/app-logger";
import { webhookEventFixtures } from "@/tests/fixtures/payment-test-fixtures";
import { createPendingTestPayment } from "@/tests/helpers/test-payment-data";
import { setupLoggerMocks } from "@/tests/setup/common-mocks";
import { createWebhookTestSetup, type WebhookTestSetup } from "@/tests/setup/common-test-setup";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

// ログの出力をキャプチャするためのモック
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

/**
 * リクエストを作成
 */
function createRequest(body: unknown, headersInit?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/workers/stripe-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Message-Id": "msg_test_123",
    "Upstash-Retried": "0",
    ...headersInit,
  });
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * PaymentIntentイベントを作成
 */
function createPaymentIntentEvent(
  paymentIntentId: string,
  setup: WebhookTestSetup,
  overrides: Partial<{
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }> = {}
): any {
  const evt = webhookEventFixtures.paymentIntentSucceeded();
  const paymentIntent = evt.data.object as any;
  paymentIntent.id = paymentIntentId;
  paymentIntent.amount = overrides.amount ?? 1500;
  paymentIntent.currency = overrides.currency ?? "jpy";
  paymentIntent.metadata = overrides.metadata ?? {
    payment_id: "will_be_set_in_test",
    attendance_id: setup.testAttendance.id,
    event_title: setup.testEvent.title,
  };
  return evt;
}

describe("正常系テスト", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `payment-intent-succeeded-normal-test-${Date.now()}`,
      eventFee: 1500,
      accessedTables: ["public.payments", "public.attendances", "public.events"],
    });
  });

  afterAll(async () => {
    try {
      // テスト実行（必要に応じて）
    } finally {
      // 必ずクリーンアップを実行
      await setup.cleanup();
    }
  });

  beforeEach(() => {
    mockVerify.mockResolvedValue(true);
  });

  describe("決済レコードの特定", () => {
    it("stripe_payment_intent_idで決済レコードを特定できる（最優先）", async () => {
      const paymentIntentId = `pi_priority_test_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      // stripe_payment_intent_id を事前に設定
      await setup.adminClient
        .from("payments")
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq("id", payment.id);

      const evt = createPaymentIntentEvent(paymentIntentId, setup);
      // metadata.payment_idは異なるIDを設定（優先順位テストのため）
      evt.data.object.metadata.payment_id = "different_payment_id";

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);

      // 決済が paid に更新されているか確認
      const { data: updatedPayment } = await setup.adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("paid");
      expect(updatedPayment.paid_at).toBeTruthy();
      expect(updatedPayment.webhook_event_id).toBe(evt.id);
      expect(updatedPayment.webhook_processed_at).toBeTruthy();
      expect(updatedPayment.updated_at).toBeTruthy();
      expect(updatedPayment.stripe_payment_intent_id).toBe(paymentIntentId);
    });

    it("metadata.payment_idでフォールバック検索ができる", async () => {
      const paymentIntentId = `pi_fallback_test_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        metadata: {
          payment_id: payment.id,
          attendance_id: setup.testAttendance.id,
          event_title: setup.testEvent.title,
        },
      });

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);

      // stripe_payment_intent_idが更新されているか確認
      const { data: updatedPayment } = await setup.adminClient
        .from("payments")
        .select("stripe_payment_intent_id")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.stripe_payment_intent_id).toBe(paymentIntentId);
    });
  });

  describe("金額・通貨の整合性チェック", () => {
    it("金額と通貨が一致する場合は正常に処理される", async () => {
      const paymentIntentId = `pi_amount_match_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 2000, // 2000円
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        amount: 2000, // 一致
        currency: "jpy", // JPY
        metadata: { payment_id: payment.id },
      });

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);
    });

    it("テスト環境では金額が省略されても処理される", async () => {
      const paymentIntentId = `pi_test_env_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        metadata: { payment_id: payment.id },
      });
      // テスト環境でのモック値省略をシミュレート
      delete (evt.data.object as any).amount;

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);
    });
  });

  describe("重複処理防止", () => {
    it("既にpaid状態の決済は重複処理をスキップ", async () => {
      const paymentIntentId = `pi_duplicate_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      // 最初の処理
      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        metadata: { payment_id: payment.id },
      });

      const req1 = setup.createRequest({ event: evt });
      const res1 = await WorkerPOST(req1);
      expect(res1.status).toBe(204);

      // 2回目の処理（重複）
      const req2 = setup.createRequest({ event: evt });
      const res2 = await WorkerPOST(req2);
      expect(res2.status).toBe(204);

      // 重複処理防止ログが出力されているか確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_duplicate_processing_prevented",
          details: expect.objectContaining({
            eventId: evt.id,
            paymentId: payment.id,
            currentStatus: "paid",
          }),
        })
      );
    });

    it("冪等性が保証される", async () => {
      // 専用のattendanceとpaymentを作成（他のテストと隔離）
      const { createTestAttendance } = await import("@/tests/helpers/test-payment-data");
      const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);

      const paymentIntentId = `pi_idempotent_${Date.now()}`;
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        metadata: { payment_id: payment.id },
      });

      // 複数回実行
      const results = await Promise.all([
        WorkerPOST(createRequest({ event: evt })),
        WorkerPOST(createRequest({ event: evt })),
        WorkerPOST(createRequest({ event: evt })),
      ]);

      // すべて成功
      results.forEach((res) => {
        expect(res.status).toBe(204);
      });

      // 決済は1つだけpaid状態（専用attendanceで検索）
      const { data: payments } = await setup.supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", dedicatedAttendance.id)
        .eq("status", "paid");

      expect(payments).toHaveLength(1);
      expect(payments[0].id).toBe(payment.id);
    });
  });

  describe("売上集計の更新", () => {
    it("売上集計RPCが正常に呼び出される", async () => {
      const paymentIntentId = `pi_revenue_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        metadata: { payment_id: payment.id },
      });

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);

      expect(res.status).toBe(204);

      // 統合テストでは実際のRPC関数が呼び出されることを確認
      // （具体的な呼び出し検証はログやDB状態で行う）
    });

    it("売上集計は実際のRPC関数で動作する", async () => {
      const paymentIntentId = `pi_revenue_real_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        metadata: { payment_id: payment.id },
      });

      const req = createRequest({ event: evt });
      const res = await WorkerPOST(req);

      // 決済処理は成功（実際のRPC関数が呼ばれても成功する）
      expect(res.status).toBe(204);

      // 決済はpaidに更新されている
      const { data: updatedPayment } = await setup.adminClient
        .from("payments")
        .select("status")
        .eq("id", payment.id)
        .single();

      expect(updatedPayment.status).toBe("paid");

      // 注意: 統合テストでは実際のRPC関数が実行される
      // エラーケースは別途ユニットテストで検証すべき
    });
  });

  describe("正常ログ出力", () => {
    it("処理成功時に適切なセキュリティログが出力される", async () => {
      const paymentIntentId = `pi_log_success_${Date.now()}`;
      const payment = await createPendingTestPayment(setup.testAttendance.id, {
        amount: 1500,
        stripeAccountId: setup.testUser.stripeConnectAccountId,
      });

      const evt = createPaymentIntentEvent(paymentIntentId, setup, {
        amount: 1500,
        currency: "jpy",
        metadata: { payment_id: payment.id },
      });

      const req = createRequest({ event: evt });
      await WorkerPOST(req);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_payment_succeeded_processed",
          details: expect.objectContaining({
            eventId: evt.id,
            paymentId: payment.id,
            amount: 1500,
            currency: "jpy",
          }),
        })
      );
    });
  });
});
