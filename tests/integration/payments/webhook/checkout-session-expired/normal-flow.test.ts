/**
 * checkout.session.expired Webhook 正常系テスト
 *
 * 正常系: pending → failed へのステータス遷移
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { logger } from "../../../../../core/logging/app-logger";
import { StripeWebhookEventHandler } from "../../../../../features/payments/services/webhook/webhook-event-handler";
import { createPendingTestPayment } from "../../../../helpers/test-payment-data";
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

describe("🔄 正常系: pending → failed 遷移", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-test-${Date.now()}`,
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

  test("stripe_checkout_session_idによる突合で決済レコードを更新", async () => {
    // Arrange: pending状態の決済レコードを準備
    const sessionId = "cs_test_expired_" + Date.now();
    const paymentIntentId = "pi_test_expired_" + Date.now();

    // 決済レコードを明示的に作成
    const payment = await createPendingTestPayment(setup.testAttendance.id, {
      amount: 1500,
      stripeAccountId: setup.testUser.stripeConnectAccountId,
    });

    // 決済レコードを pending に設定し、セッションIDを設定
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

    // Act: Webhookハンドラー実行
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: レスポンス検証
    expect(result).toEqual({
      success: true,
      eventId: event.id,
      paymentId: payment.id,
    });

    // Assert: データベース更新検証
    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment).toMatchObject({
      status: "failed",
      webhook_event_id: event.id,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
    });
    expect(updatedPayment.webhook_processed_at).toBeTruthy();
    expect(updatedPayment.updated_at).toBeTruthy();

    // Assert: ログ出力検証
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Webhook security event",
      expect.objectContaining({
        event_action: "webhook_checkout_expired_processed",
        details: expect.objectContaining({
          eventId: event.id,
          paymentId: payment.id,
          sessionId,
          paymentIntentId,
        }),
      })
    );
  });

  test("metadata.payment_id フォールバック突合で決済レコードを更新", async () => {
    // Arrange: metadata経由での突合テスト用
    const sessionId = "cs_test_metadata_" + Date.now();

    // 決済レコードを明示的に作成
    const payment = await createPendingTestPayment(setup.testAttendance.id, {
      amount: 1500,
      stripeAccountId: setup.testUser.stripeConnectAccountId,
    });

    // stripe_checkout_session_idを設定せず、metadataで突合させる
    await setup.adminClient
      .from("payments")
      .update({
        status: "pending",
        stripe_checkout_session_id: null, // 意図的にnullにして、metadataフォールバックをテスト
      })
      .eq("id", payment.id);

    const event = createCheckoutExpiredEvent(sessionId, {
      metadata: { payment_id: payment.id },
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: レスポンス検証
    expect(result).toEqual({
      success: true,
      eventId: event.id,
      paymentId: payment.id,
    });

    // Assert: データベース更新検証
    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment).toMatchObject({
      status: "failed",
      webhook_event_id: event.id,
      stripe_checkout_session_id: sessionId,
    });
  });

  test("PaymentIntent ID が null の場合はデータベース制約エラー", async () => {
    // Arrange
    const sessionId = "cs_test_no_pi_" + Date.now();

    // 決済レコードを明示的に作成
    const payment = await createPendingTestPayment(setup.testAttendance.id, {
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
      payment_intent: null, // PaymentIntent ID なし
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: データベース制約違反によりエラー
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("payments_stripe_intent_required"),
    });

    // Assert: 決済レコードは更新されていない
    const { data: unchangedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(unchangedPayment.status).toBe("pending");
  });
});
