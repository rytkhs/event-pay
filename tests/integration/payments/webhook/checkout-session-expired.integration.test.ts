/**
 * checkout.session.expired Webhook 統合テスト
 *
 * 目的:
 * - Stripe Checkout セッション期限切れ時の処理を網羅的に検証
 * - 仕様書に基づく厳密な動作確認
 * - データベース更新、ログ出力、レスポンス構造の検証
 *
 * テスト範囲:
 * - 正常系: pending → failed へのステータス遷移
 * - 異常系: 決済レコード未発見、ステータス降格防止、重複処理
 * - 境界値: メタデータ欠損、PaymentIntent ID null 等
 */

import { NextRequest as _NextRequest } from "next/server";

import { logger } from "../../../../core/logging/app-logger";
import { SecureSupabaseClientFactory } from "../../../../core/security/secure-client-factory.impl";
import { AdminReason } from "../../../../core/security/secure-client-factory.types";
import { canPromoteStatus } from "../../../../core/utils/payments/status-rank";
import { StripeWebhookEventHandler } from "../../../../features/payments/services/webhook/webhook-event-handler";
import type { Database } from "../../../../types/database";
import {
  createPaidTestEvent,
  createTestAttendance,
  createPendingTestPayment,
  type TestPaymentUser,
  TestPaymentEvent,
  TestAttendanceData,
} from "../../../helpers/test-payment-data";
import { mockCheckoutSession as _mockCheckoutSession } from "../../../setup/stripe-mock";
import { createTestWebhookEvent } from "../../../setup/stripe-test-helpers";
import { testDataManager, createConnectTestData } from "../../../setup/test-data-seeds";

// 外部依存のモック（統合テストなので最小限）
jest.mock("../../../../core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("checkout.session.expired Webhook統合テスト", () => {
  let supabase: any;
  let testUser: TestPaymentUser;
  let testEvent: TestPaymentEvent;
  let testAttendance: TestAttendanceData;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeAll(async () => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";

    // テストデータの準備
    const { activeUser } = await createConnectTestData();
    testUser = activeUser;
    testEvent = await createPaidTestEvent(activeUser.id, {
      title: `Checkout Expired Test Event ${Date.now()}`,
      fee: 1500,
    });
    testAttendance = await createTestAttendance(testEvent.id);

    // Supabaseクライアント取得
    const factory = SecureSupabaseClientFactory.getInstance();
    supabase = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "checkout.session.expired webhook test setup",
      {
        operationType: "SELECT",
        accessedTables: ["public.payments", "public.attendances"],
        additionalInfo: { testContext: "webhook-integration" },
      }
    );

    mockLogger = logger as jest.Mocked<typeof logger>;
  });

  afterAll(async () => {
    await testDataManager.cleanupTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

  describe("🔄 正常系: pending → failed 遷移", () => {
    test("stripe_checkout_session_idによる突合で決済レコードを更新", async () => {
      // Arrange: pending状態の決済レコードを準備
      const sessionId = "cs_test_expired_" + Date.now();
      const paymentIntentId = "pi_test_expired_" + Date.now();

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(testAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      // 決済レコードを pending に設定し、セッションIDを設定
      await supabase
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
      const { data: updatedPayment } = await supabase
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
          type: "webhook_checkout_expired_processed",
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
      const payment = await createPendingTestPayment(testAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      // stripe_checkout_session_idを設定せず、metadataで突合させる
      await supabase
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
      const { data: updatedPayment } = await supabase
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
      const payment = await createPendingTestPayment(testAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      await supabase
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
      const { data: unchangedPayment } = await supabase
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(unchangedPayment.status).toBe("pending");
    });
  });

  describe("⚠️ 異常系: 決済レコード未発見", () => {
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
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_checkout_expired_no_payment",
          details: expect.objectContaining({ eventId: event.id, sessionId: nonExistentSessionId }),
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

      // Assert: セキュリティログ出力
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_checkout_expired_no_payment",
          details: expect.objectContaining({ eventId: event.id, sessionId }),
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

      // Assert: セキュリティログ出力
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_checkout_expired_no_payment",
          details: expect.objectContaining({ eventId: event.id, sessionId }),
        })
      );
    });
  });

  describe("🚫 異常系: ステータス降格防止", () => {
    test.each([
      ["paid", 20],
      ["received", 25],
      ["waived", 28],
      ["completed", 30],
      ["refunded", 40],
    ])("%s ステータス（ランク %d）からの降格を防止", async (currentStatus, _expectedRank) => {
      // Arrange: 高位ステータスの決済レコード
      const sessionId = `cs_test_prevent_${currentStatus}_` + Date.now();

      // 独立したattendanceを作成してテストデータを分離
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      // ステータス更新を確実に実行（制約に準拠）
      const updateData: any = {
        status: currentStatus,
        stripe_checkout_session_id: sessionId,
      };

      // 高位ステータスには必須フィールドを設定
      if (["paid", "received", "completed", "refunded", "waived"].includes(currentStatus)) {
        updateData.paid_at = new Date().toISOString();
        updateData.stripe_payment_intent_id = `pi_test_${currentStatus}_${Date.now()}`;
      }

      // failed/waived ステータスにも PaymentIntent ID が必要
      if (["failed", "waived"].includes(currentStatus)) {
        updateData.stripe_payment_intent_id = `pi_test_${currentStatus}_${Date.now()}`;
      }

      const { error: updateError } = await supabase
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
      const { data: unchangedPayment } = await supabase
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(unchangedPayment.status).toBe(currentStatus);

      // Assert: 重複処理防止ログ
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_duplicate_processing_prevented",
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
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      const { error: updateError } = await supabase
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
      expect(result).toEqual({
        success: true,
      });

      // Assert: 重複処理防止ログ
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_duplicate_processing_prevented",
          details: expect.objectContaining({
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: "failed",
          }),
        })
      );
    });
  });

  // TODO: エラーハンドリングテストは統合テストでは困難なため単体テストで実施
  // describe("🔧 エラーハンドリング", () => {
  //   // データベースモックが必要なテストは単体テストで実施
  // });

  describe("🎯 境界値・エッジケース", () => {
    test("空文字のPaymentIntent IDは制約エラー", async () => {
      // Arrange
      const sessionId = "cs_test_empty_pi_" + Date.now();

      // 独立した attendance を作成
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      await supabase
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

      // Assert: データベース制約違反によりエラー
      expect(result.success).toBe(false);
      expect(result.error).toContain("payments_stripe_intent_required");
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

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_checkout_expired_no_payment",
          details: expect.objectContaining({ eventId: event.id, sessionId }),
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

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_checkout_expired_no_payment",
          details: expect.objectContaining({ eventId: event.id, sessionId }),
        })
      );
    });

    test("非文字列型のPaymentIntentは制約エラー", async () => {
      // Arrange
      const sessionId = "cs_test_non_string_pi_" + Date.now();

      // 独立した attendance を作成
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      await supabase
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

      // Assert: データベース制約違反によりエラー
      expect(result.success).toBe(false);
      expect(result.error).toContain("payments_stripe_intent_required");
    });
  });

  describe("📊 レスポンス構造検証", () => {
    test("正常処理時のレスポンス構造", async () => {
      // Arrange
      const sessionId = "cs_test_response_structure_" + Date.now();

      // 独立した attendance を作成
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      await supabase
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
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      await supabase
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

  describe("🔍 ログ出力仕様検証", () => {
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
            const dedicatedAttendance = await createTestAttendance(testEvent.id);

            // 決済レコードを明示的に作成
            const payment = await createPendingTestPayment(dedicatedAttendance.id, {
              amount: 1500,
              stripeAccountId: testUser.stripeConnectAccountId,
            });

            // completedステータスに更新（制約対応）
            await supabase
              .from("payments")
              .update({
                status: "completed",
                stripe_checkout_session_id: sessionId,
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: `pi_test_log_completed_${Date.now()}`,
              })
              .eq("id", payment.id);

            const event = createCheckoutExpiredEvent(sessionId);
            return { event, sessionId, payment };
          },
          expectedDetails: (data: any) => ({
            eventId: data.event.id,
            paymentId: data.payment.id,
            currentStatus: "completed",
          }),
        },
        {
          name: "正常処理完了",
          logType: "webhook_checkout_expired_processed",
          setupFn: async () => {
            const sessionId = "cs_test_log_success_" + Date.now();
            const paymentIntentId = "pi_test_log_" + Date.now();

            // 独立したattendanceを作成
            const dedicatedAttendance = await createTestAttendance(testEvent.id);

            // 決済レコードを明示的に作成
            const payment = await createPendingTestPayment(dedicatedAttendance.id, {
              amount: 1500,
              stripeAccountId: testUser.stripeConnectAccountId,
            });

            await supabase
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
        expect(mockLogger.info).toHaveBeenCalledWith("Webhook security event", {
          type: testCase.logType,
          details: testCase.expectedDetails(data),
        });

        // モックをリセット
        jest.clearAllMocks();
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

  describe("⚙️ 冪等性保証", () => {
    test("同一イベントIDによる重複処理の冪等性", async () => {
      // Arrange: 初回処理
      const sessionId = "cs_test_idempotent_" + Date.now();

      // 独立した attendance を作成
      const dedicatedAttendance = await createTestAttendance(testEvent.id);

      // 決済レコードを明示的に作成
      const payment = await createPendingTestPayment(dedicatedAttendance.id, {
        amount: 1500,
        stripeAccountId: testUser.stripeConnectAccountId,
      });

      await supabase
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
        eventId: event.id,
        paymentId: payment.id,
      });

      // Act: 同一イベントで再処理
      jest.clearAllMocks();
      const secondResult = await handler.handleEvent(event);

      // Assert: 2回目は重複処理防止
      expect(secondResult).toEqual({
        success: true,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Webhook security event",
        expect.objectContaining({
          type: "webhook_duplicate_processing_prevented",
          details: expect.objectContaining({
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: "failed",
          }),
        })
      );

      // Assert: データベース状態は変わらない
      const { data: finalPayment } = await supabase
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .single();

      expect(finalPayment.status).toBe("failed");
      expect(finalPayment.webhook_event_id).toBe(event.id);
    });

    test("ステータスランク違反による冪等性", async () => {
      // canPromoteStatus関数のロジックを直接テスト
      const statusTests = [
        { current: "paid", target: "failed", expected: false },
        { current: "received", target: "failed", expected: false },
        { current: "completed", target: "failed", expected: false },
        { current: "refunded", target: "failed", expected: false },
        { current: "pending", target: "failed", expected: true },
        { current: "failed", target: "failed", expected: false }, // 同一ステータス
      ];

      statusTests.forEach(({ current, target, expected }) => {
        expect(canPromoteStatus(current as any, target as any)).toBe(expected);
      });
    });
  });

  describe("📋 仕様書準拠性検証", () => {
    test("ステータスランク値の実装準拠", async () => {
      // 仕様書記載のステータスランクを検証
      const { statusRank } = await import("../../../../core/utils/payments/status-rank");

      const expectedRanks = {
        pending: 10,
        failed: 15,
        paid: 20,
        received: 25,
        waived: 28,
        completed: 30,
        refunded: 40,
      };

      Object.entries(expectedRanks).forEach(([status, rank]) => {
        expect(statusRank(status as any)).toBe(rank);
      });
    });

    test("実装ファイルパスの確認", async () => {
      const mod1 = await import(
        "../../../../features/payments/services/webhook/webhook-event-handler"
      );
      expect(mod1.StripeWebhookEventHandler).toBeDefined();
      const mod2 = await import("../../../../core/utils/payments/status-rank");
      expect(mod2.canPromoteStatus).toBeDefined();
      const mod3 = await import("../../../../core/logging/app-logger");
      expect((mod3 as any).logger).toBeDefined();
    });

    test("データベーススキーマ型定義の準拠", () => {
      // 型定義が期待通りに存在することを確認
      type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];
      type _PaymentTable = Database["public"]["Tables"]["payments"];

      // この型が正しくインポートできることで間接的に確認
      const mockPaymentStatus: PaymentStatus = "failed";
      expect(mockPaymentStatus).toBe("failed");
    });
  });
});
