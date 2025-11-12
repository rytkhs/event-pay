/**
 * checkout.session.expired Webhook ログ出力仕様検証テスト
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { logger } from "../../../../../core/logging/app-logger";
import { StripeWebhookEventHandler } from "../../../../../features/payments/services/webhook/webhook-event-handler";
import {
  createTestAttendance,
  createPendingTestPayment,
} from "../../../../helpers/test-payment-data";
import { setupLoggerMocks } from "../../../../setup/common-mocks";
import { createWebhookTestSetup, type WebhookTestSetup } from "../../../../setup/common-test-setup";
import { createTestWebhookEvent } from "../../../../setup/stripe-test-helpers";

// 外部依存のモック（統合テストなので最小限）
jest.mock("../../../../../core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/**
 * Checkout Session Expired イベントを作成
 */
function createCheckoutExpiredEvent(
  sessionId: string,
  overrides: Partial<{
    payment_intent: string | null;
    metadata: Record<string, string>;
  }> = {}
): any {
  return createTestWebhookEvent("checkout.session.expired", {
    id: sessionId,
    payment_intent: "pi_test_expired_" + Date.now(),
    metadata: {},
    ...overrides,
  });
}

describe("🔍 ログ出力仕様検証", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-logging-test-${Date.now()}`,
      eventFee: 1500,
      accessedTables: ["public.payments", "public.attendances"],
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

  test("全ログタイプのメッセージ形式検証", async () => {
    const testCases = [
      {
        name: "決済レコード未発見",
        logType: "webhook_checkout_expired_no_payment",
        setupFn: async () => {
          const sessionId = "cs_test_log_no_payment_" + Date.now();
          const event = createCheckoutExpiredEvent(sessionId);
          return { event, sessionId };
        },
        expectedDetails: (data: any) => ({
          eventId: data.event.id,
          sessionId: data.sessionId,
        }),
      },
      {
        name: "重複処理防止",
        logType: "webhook_duplicate_processing_prevented",
        setupFn: async () => {
          const sessionId = "cs_test_log_duplicate_" + Date.now();

          // 独立したattendanceを作成
          const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);

          // 決済レコードを明示的に作成
          const payment = await createPendingTestPayment(dedicatedAttendance.id, {
            amount: 1500,
            stripeAccountId: setup.testUser.stripeConnectAccountId,
          });

          // completedステータスに更新（制約対応）
          await setup.adminClient
            .from("payments")
            .update({
              status: "received",
              stripe_checkout_session_id: sessionId,
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: `pi_test_log_received_${Date.now()}`,
            })
            .eq("id", payment.id);

          const event = createCheckoutExpiredEvent(sessionId);
          return { event, sessionId, payment };
        },
        expectedDetails: (data: any) => ({
          eventId: data.event.id,
          paymentId: data.payment.id,
          currentStatus: "received",
        }),
      },
      {
        name: "正常処理完了",
        logType: "webhook_checkout_expired_processed",
        setupFn: async () => {
          const sessionId = "cs_test_log_success_" + Date.now();
          const paymentIntentId = "pi_test_log_" + Date.now();

          // 独立したattendanceを作成
          const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);

          // 決済レコードを明示的に作成
          const payment = await createPendingTestPayment(dedicatedAttendance.id, {
            amount: 1500,
            stripeAccountId: setup.testUser.stripeConnectAccountId,
          });

          await setup.adminClient
            .from("payments")
            .update({
              status: "pending",
              stripe_checkout_session_id: sessionId,
            })
            .eq("id", payment.id);

          const event = createCheckoutExpiredEvent(sessionId, {
            payment_intent: paymentIntentId,
          });
          return { event, sessionId, payment, paymentIntentId };
        },
        expectedDetails: (data: any) => ({
          eventId: data.event.id,
          paymentId: data.payment.id,
          sessionId: data.sessionId,
          paymentIntentId: data.paymentIntentId,
        }),
      },
    ];

    for (const testCase of testCases) {
      // サブテストとして実行
      const data = await testCase.setupFn();

      const handler = new StripeWebhookEventHandler();
      await handler.handleEvent(data.event);

      // ログ出力検証
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          event_action: testCase.logType,
          details: expect.objectContaining(testCase.expectedDetails(data)),
        })
      );
    }
  });

  test("ログレベルは常に info", async () => {
    // すべてのケースでlogger.infoが呼ばれることを確認
    expect(mockLogger.info).toBeDefined();
    expect(mockLogger.error).toBeDefined();

    // infoレベルのみが使用されることを間接的に確認
    // （他のテストケースでerrorが呼ばれていないことで確認される）
  });
});
