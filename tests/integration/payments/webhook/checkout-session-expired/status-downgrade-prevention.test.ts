/**
 * checkout.session.expired Webhook ステータス降格防止テスト
 *
 * 異常系: ステータス降格防止
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { logger } from "../../../../../core/logging/app-logger";
import { canPromoteStatus } from "../../../../../core/utils/payments/status-rank";
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

describe("🚫 異常系: ステータス降格防止", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-downgrade-test-${Date.now()}`,
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

  test.each([
    ["paid", 20],
    ["received", 20],
    ["waived", 25],
    ["canceled", 35],
    ["refunded", 40],
  ])("%s ステータス（ランク %d）からの降格を防止", async (currentStatus, _expectedRank) => {
    // Arrange: 高位ステータスの決済レコード
    const sessionId = `cs_test_prevent_${currentStatus}_` + Date.now();

    // 独立したattendanceを作成してテストデータを分離
    const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);

    // 決済レコードを明示的に作成
    const payment = await createPendingTestPayment(dedicatedAttendance.id, {
      amount: 1500,
      stripeAccountId: setup.testUser.stripeConnectAccountId,
    });

    // ステータス更新を確実に実行（制約に準拠）
    const updateData: any = {
      status: currentStatus,
      stripe_checkout_session_id: sessionId,
    };

    // 高位ステータスには必須フィールドを設定
    if (["paid", "received", "refunded", "waived"].includes(currentStatus)) {
      updateData.paid_at = new Date().toISOString();
      updateData.stripe_payment_intent_id = `pi_test_${currentStatus}_${Date.now()}`;
    }

    // failed/waived ステータスにも PaymentIntent ID が必要
    if (["failed", "waived"].includes(currentStatus)) {
      updateData.stripe_payment_intent_id = `pi_test_${currentStatus}_${Date.now()}`;
    }

    // canceled ステータスには paid_at を null にする
    if (currentStatus === "canceled") {
      updateData.paid_at = null;
    }

    const { error: updateError } = await setup.adminClient
      .from("payments")
      .update(updateData)
      .eq("id", payment.id);

    if (updateError) {
      throw new Error(`Failed to update payment status: ${updateError.message}`);
    }

    const event = createCheckoutExpiredEvent(sessionId);

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 正常レスポンス（更新はスキップ）
    expect(result).toEqual({
      success: true,
    });

    // Assert: ステータス変更されていない
    const { data: unchangedPayment } = await setup.adminClient
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();

    expect(unchangedPayment.status).toBe(currentStatus);

    // Assert: 重複処理防止ログ
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Webhook security event",
      expect.objectContaining({
        event_action: "webhook_duplicate_processing_prevented",
        details: expect.objectContaining({
          eventId: event.id,
          paymentId: payment.id,
          currentStatus: currentStatus,
        }),
      })
    );

    // Assert: ステータスランク検証（仕様書との整合性）
    expect(canPromoteStatus(currentStatus as any, "failed")).toBe(false);
  });

  test("同一ステータス failed → failed の重複処理防止", async () => {
    // Arrange: 既にfailedステータス
    const sessionId = "cs_test_duplicate_failed_" + Date.now();

    // 独立したattendanceを作成
    const dedicatedAttendance = await createTestAttendance(setup.testEvent.id);

    // 決済レコードを明示的に作成
    const payment = await createPendingTestPayment(dedicatedAttendance.id, {
      amount: 1500,
      stripeAccountId: setup.testUser.stripeConnectAccountId,
    });

    const { error: updateError } = await setup.adminClient
      .from("payments")
      .update({
        status: "failed",
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: `pi_test_failed_${Date.now()}`, // 制約対応
      })
      .eq("id", payment.id);

    if (updateError) {
      throw new Error(`Failed to update payment status: ${updateError.message}`);
    }

    const event = createCheckoutExpiredEvent(sessionId);

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 正常レスポンス（重複処理防止）
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      })
    );

    // Assert: 重複処理防止ログ
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Webhook security event",
      expect.objectContaining({
        event_action: "webhook_duplicate_processing_prevented",
        details: expect.objectContaining({
          eventId: event.id,
          paymentId: payment.id,
          currentStatus: "failed",
        }),
      })
    );
  });
});
