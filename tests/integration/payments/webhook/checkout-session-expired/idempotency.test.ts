/**
 * checkout.session.expired Webhook 冪等性保証テスト
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

describe("⚙️ 冪等性保証", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-idempotency-test-${Date.now()}`,
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

  test("同一イベントIDによる重複処理の冪等性", async () => {
    // Arrange: 初回処理
    const sessionId = "cs_test_idempotent_" + Date.now();

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

    const event = createCheckoutExpiredEvent(sessionId);
    const handler = new StripeWebhookEventHandler();

    // Act: 初回処理
    const firstResult = await handler.handleEvent(event);

    // Assert: 初回は正常処理
    expect(firstResult).toMatchObject({
      success: true,
      meta: {
        eventId: event.id,
        paymentId: payment.id,
      },
    });

    // Act: 同一イベントで再処理
    const secondResult = await handler.handleEvent(event);

    // Assert: 2回目は重複処理防止
    expect(secondResult).toEqual(
      expect.objectContaining({
        success: true,
      })
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      "Duplicate webhook event acknowledged via ledger",
      expect.objectContaining({
        event_id: event.id,
        event_type: "checkout.session.expired",
        outcome: "success",
      })
    );

    // Assert: データベース状態は変わらない
    const { data: finalPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(finalPayment.status).toBe("pending");
    expect(finalPayment.stripe_checkout_session_id).toBeNull();
    expect(finalPayment.webhook_event_id).toBeNull();
  });

  test("期限切れ処理後に同じpaymentへ別セッションを紐づけられる", async () => {
    const sessionId = "cs_test_recreate_" + Date.now();
    const nextSessionId = "cs_test_recreate_next_" + Date.now();
    const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);
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

    const handler = new StripeWebhookEventHandler();
    await handler.handleEvent(createCheckoutExpiredEvent(sessionId));

    const { error } = await setup.adminClient
      .from("payments")
      .update({
        stripe_checkout_session_id: nextSessionId,
      })
      .eq("id", payment.id);

    expect(error).toBeNull();

    const { data: updatedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(updatedPayment.status).toBe("pending");
    expect(updatedPayment.stripe_checkout_session_id).toBe(nextSessionId);
  });
});
