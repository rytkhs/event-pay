/**
 * Verify Session API: フォールバック機能テスト
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

// モックは他のインポートより前に宣言する必要がある
jest.mock("@core/security/security-logger");
jest.mock("@core/rate-limit");

import { type FallbackScenario, FALLBACK_SCENARIOS } from "@tests/helpers/test-verify-session";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("🔧 フォールバック機能テスト", () => {
  let context: VerifySessionTestContext;

  beforeAll(async () => {
    context = await setupVerifySessionTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  afterEach(async () => {
    await cleanupAfterEach(context);
  });

  test("フォールバック機能 - 複数パターンの一括テスト", async () => {
    // 事前定義されたフォールバックシナリオを使用
    const fallbackScenarios: FallbackScenario[] = [
      {
        ...FALLBACK_SCENARIOS.CLIENT_REFERENCE_ID,
        sessionId: "cs_test_fallback_client_ref_refactored",
      },
      {
        ...FALLBACK_SCENARIOS.METADATA,
        sessionId: "cs_test_fallback_metadata_refactored",
      },
      {
        ...FALLBACK_SCENARIOS.PAYMENT_INTENT_METADATA,
        sessionId: "cs_test_fallback_pi_metadata_refactored",
      },
    ];

    // バッチ実行
    const results = await context.testHelper.runBatchScenarios(
      fallbackScenarios,
      verifySessionHandler
    );

    // 全て成功することを確認
    results.forEach((result, index) => {
      if (result.error) {
        console.error(`❌ Fallback scenario ${index + 1} failed:`, result.error);
      }
      expect(result.error).toBeUndefined();
      expect(result.result.payment_status).toBe("pending"); // 実際のStripe APIでは作成直後はpending
      console.log(`✅ Fallback scenario ${index + 1} completed`);
    });

    // フォールバックログが記録されていることを確認（各シナリオで1回ずつ）
    expect(context.mockLogSecurityEvent).toHaveBeenCalledTimes(3);
    expect(context.mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "LOW",
        message: expect.stringContaining("fallback"),
      })
    );
  });

  test("全フォールバック失敗 → 404 Not Found", async () => {
    // 実際のStripe Sessionを作成（存在しないpayment IDでフォールバック失敗を発生させる）
    const nonExistentPaymentId = "payment_id_does_not_exist_123";

    const sessionId = await context.testHelper.createRealStripeSession(nonExistentPaymentId, {
      clientReferenceId: nonExistentPaymentId,
      metadata: {
        payment_id: nonExistentPaymentId,
        test_scenario: "fallback_all_fail",
      },
    });

    const request = context.testHelper.createRequest({ sessionId });
    const response = await verifySessionHandler(request);
    const result = await response.json();

    expect(response.status).toBe(404);
    expect((result as { code: string }).code).toBe("PAYMENT_SESSION_NOT_FOUND");

    // 突合失敗のセキュリティログ確認
    expect(context.mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "HIGH",
        message: "Payment verification failed - no matching record found with guest token",
        details: expect.objectContaining({
          attendanceId: context.testSetup.attendance.id,
          sessionId: expect.stringContaining("..."), // マスクされたセッションID
          hasGuestToken: true,
          dbErrorCode: undefined, // dbErrorがnullの場合
        }),
        ip: expect.any(String),
        timestamp: expect.any(Date),
      })
    );
  });
});
