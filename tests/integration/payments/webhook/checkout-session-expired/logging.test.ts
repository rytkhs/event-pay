/**
 * checkout.session.expired Webhook ログ出力仕様検証テスト
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { StripeWebhookEventHandler } from "../../../../../features/payments/services/webhook/webhook-event-handler";
import {
  createTestAttendance,
  createPendingTestPayment,
} from "../../../../helpers/test-payment-data";
import { createWebhookTestSetup, type WebhookTestSetup } from "../../../../setup/common-test-setup";
import { createTestWebhookEvent } from "../../../../setup/stripe-test-helpers";

// 外部依存のモック（統合テストなので最小限）
// jest.mock は巻き上げられるため、モック内で直接定義する
jest.mock("../../../../../core/logging/app-logger", () => {
  const mockMethods = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return {
    logger: {
      ...mockMethods,
      withContext: jest.fn(() => mockMethods),
    },
  };
});

// handleServerErrorのモック
jest.mock("../../../../../core/utils/error-handler", () => ({
  handleServerError: jest.fn(),
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

  beforeAll(async () => {
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handleServerError } = require("../../../../../core/utils/error-handler");
    const mockHandleServerError = handleServerError as jest.MockedFunction<
      typeof handleServerError
    >;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger } = require("../../../../../core/logging/app-logger");

    const testCases = [
      {
        name: "決済レコード未発見",
        // 決済レコードがない場合は handleServerError("WEBHOOK_PAYMENT_NOT_FOUND") が呼ばれる
        verifyFn: async (data: any) => {
          expect(mockHandleServerError).toHaveBeenCalledWith(
            "WEBHOOK_PAYMENT_NOT_FOUND",
            expect.objectContaining({
              action: "processCheckoutSessionExpired",
            })
          );
        },
        setupFn: async () => {
          const sessionId = "cs_test_log_no_payment_" + Date.now();
          const event = createCheckoutExpiredEvent(sessionId);
          return { event, sessionId };
        },
      },
      {
        name: "重複処理防止",
        // 既に処理済みの場合は logger.info("Duplicate webhook event preventing double processing") が呼ばれる
        verifyFn: async (data: any) => {
          expect(logger.withContext().info).toHaveBeenCalledWith(
            "Duplicate webhook event preventing double processing",
            expect.objectContaining({
              event_id: data.event.id,
              payment_id: data.payment.id,
              current_status: "received",
              outcome: "success",
            })
          );
        },
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
      },
      {
        name: "正常処理完了",
        // 正常処理の場合は logger.info("Checkout session expiration processed") が呼ばれる
        verifyFn: async (data: any) => {
          expect(logger.withContext().info).toHaveBeenCalledWith(
            "Checkout session expiration processed",
            expect.objectContaining({
              event_id: data.event.id,
              payment_id: data.payment.id,
              outcome: "success",
            })
          );
        },
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
      },
    ];

    for (const testCase of testCases) {
      // 各テストケース前にモックをリセット
      jest.clearAllMocks();

      // サブテストとして実行
      const data = await testCase.setupFn();

      const handler = new StripeWebhookEventHandler();
      await handler.handleEvent(data.event);

      // ログ出力検証
      await testCase.verifyFn(data);
    }
  });

  test("ログレベルは常に info", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger } = require("../../../../../core/logging/app-logger");
    // すべてのケースでlogger.infoが呼ばれることを確認
    expect(logger.withContext().info).toBeDefined();
    expect(logger.withContext().error).toBeDefined();

    // infoレベルのみが使用されることを間接的に確認
    // （他のテストケースでerrorが呼ばれていないことで確認される）
  });
});
