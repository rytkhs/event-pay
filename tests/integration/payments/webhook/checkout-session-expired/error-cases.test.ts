/**
 * checkout.session.expired Webhook 異常系テスト
 *
 * 異常系: 決済レコード未発見
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { logger } from "../../../../../core/logging/app-logger";
import { StripeWebhookEventHandler } from "../../../../../features/payments/services/webhook/webhook-event-handler";
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

describe("⚠️ 異常系: 決済レコード未発見", () => {
  let setup: WebhookTestSetup;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    // ロガーモックを設定
    mockLogger = setupLoggerMocks();

    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-error-test-${Date.now()}`,
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

  test("stripe_checkout_session_id で見つからない場合の処理", async () => {
    // Arrange: 存在しないセッションID
    const nonExistentSessionId = "cs_test_not_found_" + Date.now();
    const event = createCheckoutExpiredEvent(nonExistentSessionId);

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 正常レスポンス（エラーではない）
    expect(result).toEqual({
      success: true,
    });

    // Assert: セキュリティログ出力
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Payment record not found for webhook",
      expect.objectContaining({
        error_code: "WEBHOOK_PAYMENT_NOT_FOUND",
        action: "processCheckoutSessionExpired",
        eventId: event.id,
      })
    );
  });

  test("metadata.payment_id でも見つからない場合の処理", async () => {
    // Arrange: 存在しないpayment_idをmetadataに設定
    const sessionId = "cs_test_metadata_not_found_" + Date.now();
    const nonExistentPaymentId = "payment_not_found_" + Date.now();

    const event = createCheckoutExpiredEvent(sessionId, {
      metadata: { payment_id: nonExistentPaymentId },
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 正常レスポンス
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

  test("metadata が存在しない場合の処理", async () => {
    // Arrange: metadataなし
    const sessionId = "cs_test_no_metadata_" + Date.now();
    const event = createCheckoutExpiredEvent(sessionId, {
      metadata: undefined,
    });

    // Act
    const handler = new StripeWebhookEventHandler();
    const result = await handler.handleEvent(event);

    // Assert: 正常レスポンス
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
});
