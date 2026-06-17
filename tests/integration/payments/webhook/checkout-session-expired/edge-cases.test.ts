/**
 * checkout.session.expired Webhook 境界値・エッジケーステスト
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
jest.mock("../../../../../core/logging/app-logger", () => {
  const m = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    critical: jest.fn(),
    withContext: jest.fn(),
  };
  m.withContext.mockReturnValue(m);
  return { logger: m };
});

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

describe("🎯 境界値・エッジケース", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-edge-test-${Date.now()}`,
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

  test("空文字のPaymentIntent IDはpendingのままCheckout Sessionリンクを解除", async () => {
    // Arrange
    const sessionId = "cs_test_empty_pi_" + Date.now();

    // 独立した attendance を作成
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
      payment_intent: "", // 空文字
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    expect(result.success).toBe(true);

    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment.status).toBe("pending");
    expect(updatedPayment.stripe_checkout_session_id).toBeNull();
    expect(updatedPayment.stripe_payment_intent_id).toBeNull();
  });

  test("metadata.payment_id が空文字の場合は無視", async () => {
    // Arrange
    const sessionId = "cs_test_empty_payment_id_" + Date.now();
    const event = createCheckoutExpiredEvent(sessionId, {
      metadata: { payment_id: "" }, // 空文字
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 決済レコード未発見として処理
    expect(result).toEqual({
      success: true,
    });

    // Assert: ログ出力
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Payment record not found for webhook",
      expect.objectContaining({
        error_code: "WEBHOOK_PAYMENT_NOT_FOUND",
        action: "processCheckoutSessionExpired",
        eventId: event.id,
      })
    );
  });

  test("非文字列型のmetadata.payment_idは無視", async () => {
    // Arrange
    const sessionId = "cs_test_non_string_payment_id_" + Date.now();
    const event = createCheckoutExpiredEvent(sessionId, {
      metadata: { payment_id: 12345 as any }, // 数値型（エラーケーステスト）
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 決済レコード未発見として処理
    expect(result).toEqual({
      success: true,
    });

    // Assert: ログ出力
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Payment record not found for webhook",
      expect.objectContaining({
        error_code: "WEBHOOK_PAYMENT_NOT_FOUND",
        action: "processCheckoutSessionExpired",
        eventId: event.id,
      })
    );
  });

  test("非文字列型のPaymentIntentはpendingのままCheckout Sessionリンクを解除", async () => {
    // Arrange
    const sessionId = "cs_test_non_string_pi_" + Date.now();

    // 独立した attendance を作成
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
      payment_intent: 123456 as any, // 数値型（エラーケーステスト）
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    expect(result.success).toBe(true);

    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment.status).toBe("pending");
    expect(updatedPayment.stripe_checkout_session_id).toBeNull();
    expect(updatedPayment.stripe_payment_intent_id).toBeNull();
  });
});
