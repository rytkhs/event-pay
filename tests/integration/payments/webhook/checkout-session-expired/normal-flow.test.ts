/**
 * checkout.session.expired Webhook 正常系テスト
 *
 * 正常系: pending 維持と Checkout Session リンク解除
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { logger } from "../../../../../core/logging/app-logger";
import { StripeWebhookEventHandler } from "../../../../../features/payments/services/webhook/webhook-event-handler";
import {
  createPendingTestPayment,
  createTestAttendance,
} from "../../../../helpers/test-payment-data";
import { setupLoggerMocks } from "../../../../setup/common-mocks";
import { createWebhookTestSetup, type WebhookTestSetup } from "../../../../setup/common-test-setup";
import { createTestWebhookEvent } from "../../../../setup/stripe-test-helpers";

// 外部依存のモック（統合テストなので最小限）
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

describe("🔄 正常系: pending 維持", () => {
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

  test("stripe_checkout_session_idによる突合でCheckout Sessionリンクを解除", async () => {
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
    expect(result).toMatchObject({
      success: true,
      meta: {
        eventId: event.id,
        paymentId: payment.id,
      },
    });

    // Assert: データベース更新検証
    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment).toMatchObject({
      status: "pending",
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
    });
    expect(updatedPayment.webhook_event_id).toBeNull();
    expect(updatedPayment.webhook_processed_at).toBeNull();
    expect(updatedPayment.updated_at).toBeTruthy();

    // Assert: ログ出力検証
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Checkout session expiration processed",
      expect.objectContaining({
        event_id: event.id,
        payment_id: payment.id,
        payment_intent_id: paymentIntentId,
        outcome: "success",
      })
    );
  });

  test("metadata.payment_id フォールバック突合で古いCheckout Session期限切れを無視", async () => {
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
    expect(result).toMatchObject({
      success: true,
      meta: {
        eventId: event.id,
        paymentId: payment.id,
      },
    });

    // Assert: データベース更新検証
    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment).toMatchObject({
      status: "pending",
      stripe_checkout_session_id: null,
    });
    expect(updatedPayment.webhook_event_id).toBeNull();
    expect(updatedPayment.webhook_processed_at).toBeNull();
  });

  test("古いCheckout Sessionの期限切れは現在のCheckout Sessionリンクを変更しない", async () => {
    const expiredSessionId = "cs_test_expired_old_" + Date.now();
    const currentSessionId = "cs_test_current_" + Date.now();
    const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);
    const payment = await createPendingTestPayment(dedicatedAttendance.id, {
      amount: 1500,
      stripeAccountId: setup.testUser.stripeConnectAccountId,
    });

    await setup.adminClient
      .from("payments")
      .update({
        status: "pending",
        stripe_checkout_session_id: currentSessionId,
      })
      .eq("id", payment.id);

    const event = createCheckoutExpiredEvent(expiredSessionId, {
      metadata: { payment_id: payment.id },
    });

    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    expect(result).toMatchObject({
      success: true,
      meta: {
        eventId: event.id,
        paymentId: payment.id,
      },
    });

    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment.status).toBe("pending");
    expect(updatedPayment.stripe_checkout_session_id).toBe(currentSessionId);
    expect(updatedPayment.webhook_event_id).toBeNull();
    expect(updatedPayment.webhook_processed_at).toBeNull();
  });

  test("PaymentIntent ID が null の場合もpendingのままCheckout Sessionリンクを解除", async () => {
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

    expect(result).toMatchObject({
      success: true,
      meta: {
        eventId: event.id,
        paymentId: payment.id,
      },
    });

    const { data: unchangedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(unchangedPayment.status).toBe("pending");
    expect(unchangedPayment.stripe_checkout_session_id).toBeNull();
    expect(unchangedPayment.stripe_payment_intent_id).toBeNull();
  });
});
