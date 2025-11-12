/**
 * checkout.session.expired Webhook レスポンス構造検証テスト
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { StripeWebhookEventHandler } from "../../../../../features/payments/services/webhook/webhook-event-handler";
import {
  createTestAttendance,
  createPendingTestPayment,
} from "../../../../helpers/test-payment-data";
import { createWebhookTestSetup, type WebhookTestSetup } from "../../../../setup/common-test-setup";
import { createTestWebhookEvent } from "../../../../setup/stripe-test-helpers";

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

describe("📊 レスポンス構造検証", () => {
  let setup: WebhookTestSetup;

  beforeAll(async () => {
    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-response-test-${Date.now()}`,
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

  test("正常処理時のレスポンス構造", async () => {
    // Arrange
    const sessionId = "cs_test_response_structure_" + Date.now();

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

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: WebhookProcessingResult型に準拠
    expect(result).toMatchObject({
      success: true,
      eventId: expect.any(String),
      paymentId: expect.any(String),
    });

    // Assert: 仕様書記載の具体的な値
    expect(result.eventId).toBe(event.id);
    expect(result.paymentId).toBe(payment.id);

    // Assert: 不要なフィールドが含まれていない
    expect(result.error).toBeUndefined();
    expect(result.terminal).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  test("決済レコード未発見時のレスポンス構造", async () => {
    // Arrange
    const sessionId = "cs_test_not_found_response_" + Date.now();
    const event = createCheckoutExpiredEvent(sessionId);

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 最小限のレスポンス
    expect(result).toEqual({
      success: true,
    });

    // Assert: 不要なフィールドが含まれていない
    expect(result.eventId).toBeUndefined();
    expect(result.paymentId).toBeUndefined();
  });

  test("重複処理防止時のレスポンス構造", async () => {
    // Arrange
    const sessionId = "cs_test_duplicate_response_" + Date.now();

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
        status: "paid",
        stripe_checkout_session_id: sessionId,
        paid_at: new Date().toISOString(), // 制約対応
        stripe_payment_intent_id: `pi_test_duplicate_${Date.now()}`, // 制約対応
      })
      .eq("id", payment.id);

    const event = createCheckoutExpiredEvent(sessionId);

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 最小限のレスポンス
    expect(result).toEqual({
      success: true,
    });

    // Assert: 不要なフィールドが含まれていない
    expect(result.eventId).toBeUndefined();
    expect(result.paymentId).toBeUndefined();
  });
});
