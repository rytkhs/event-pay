/**
 * Verify Session API: 仕様書の実装差異検出テスト
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";
import { maskSessionId } from "@core/utils/mask";
import type { ErrorScenario, VerifySessionScenario } from "@tests/helpers/test-verify-session";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

jest.mock("@core/security/security-logger");
jest.mock("@core/rate-limit");

describe("🔍 仕様書の実装差異検出テスト", () => {
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

  test("【重要】レスポンス型定義の仕様書準拠性", async () => {
    const specComplianceScenario: VerifySessionScenario = {
      name: "レスポンス型定義仕様書準拠テスト",
      sessionId: "cs_test_response_type_validation",
      paymentStatus: "paid",
      stripeResponse: {
        payment_status: "paid",
      },
      shouldCreatePayment: true,
      paymentOverrides: {
        stripe_payment_intent_id: "pi_test_response_type",
      },
      useIndependentAttendance: true,
    };

    const result = await context.testHelper.runSuccessScenario(
      specComplianceScenario,
      verifySessionHandler
    );

    // 仕様書更新後のレスポンス型定義確認
    expect(result).toHaveProperty("payment_status");
    expect(result).toHaveProperty("payment_required");

    // 型の正確性
    expect(typeof result.payment_status).toBe("string");
    expect(typeof result.payment_required).toBe("boolean");

    // 成功時はProblem Details以外のエラー情報は含めない
    expect(result).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("success");
  });

  test("【重要】レート制限設定の仕様書準拠性", async () => {
    const request = context.testHelper.createRequest({});
    await verifySessionHandler(request);

    // 仕様書記載のレート制限設定確認
    expect(context.mockWithRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "stripe.checkout",
        limit: 10,
        window: "1 m",
        blockMs: 2 * 60 * 1000,
      }),
      expect.any(Function)
    );
  });

  test("【重要】エラーレスポンスのProblem Details準拠性", async () => {
    const errorScenario: ErrorScenario = {
      name: "Problem Detailsエラーレスポンス形式確認",
      requestConfig: { sessionId: "" },
      expectedStatus: 422,
    };

    const result = await context.testHelper.runErrorScenario(errorScenario, verifySessionHandler);

    // RFC 7807 Problem Details 必須フィールド
    const requiredFields = ["type", "title", "status", "detail", "instance"];
    requiredFields.forEach((field) => {
      expect(result).toHaveProperty(field);
    });

    // EventPay拡張フィールド
    const eventPayFields = ["code", "correlation_id", "retryable"];
    eventPayFields.forEach((field) => {
      expect(result).toHaveProperty(field);
    });
  });

  test("【重要】セキュリティログ記録の仕様書準拠性", async () => {
    // トークン不一致でセキュリティイベント発生
    const securityTestScenario: ErrorScenario = {
      name: "セキュリティログテスト",
      requestConfig: {
        sessionId: "cs_test_security_log",
        guestToken: "invalid_token",
      },
      expectedStatus: 404,
    };

    await context.testHelper.runErrorScenario(securityTestScenario, verifySessionHandler);

    // 仕様書記載のセキュリティイベント形式確認
    expect(context.mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "HIGH",
        message: expect.stringContaining("token mismatch"),
        details: expect.objectContaining({
          attendanceId: expect.any(String),
          sessionId: expect.stringContaining("..."),
          tokenMatch: false,
        }),
        ip: expect.any(String),
        timestamp: expect.any(Date),
      })
    );
  });

  test("【重要】セッションIDマスク処理の確認", async () => {
    const longSessionId = "cs_test_mask_processing_123456789";
    const request = context.testHelper.createRequest({
      sessionId: longSessionId,
      guestToken: "invalid_token",
    });

    await verifySessionHandler(request);

    // セッションIDの統一マスク関数使用確認
    expect(context.mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          sessionId: maskSessionId(longSessionId),
        }),
      })
    );
  });
});
