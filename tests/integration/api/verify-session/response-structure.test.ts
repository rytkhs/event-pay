/**
 * Verify Session API: レスポンス構造検証
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
// モックは他のインポートより前に宣言する必要がある
jest.mock("@core/security/security-logger");
jest.mock("@core/rate-limit");

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";
import type { VerifySessionScenario } from "@tests/helpers/test-verify-session";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("📋 レスポンス構造検証", () => {
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

  test("成功時レスポンス構造の厳密検証", async () => {
    const responseTestScenario: VerifySessionScenario = {
      name: "成功時レスポンス構造検証",
      sessionId: "cs_test_response_structure",
      paymentStatus: "paid",
      stripeResponse: {
        payment_status: "paid",
      },
      shouldCreatePayment: true,
      paymentOverrides: {
        stripe_payment_intent_id: "pi_test_response",
      },
      useIndependentAttendance: true,
    };

    const result = await context.testHelper.runSuccessScenario(
      responseTestScenario,
      verifySessionHandler
    );

    // 実際のStripe APIレスポンスに基づくフィールド
    expect(result).toEqual({
      payment_status: "pending", // 実際のStripe Sessionは作成直後はpending
      payment_required: true,
    });

    // 成功時はerrorフィールドは省略される（仕様書準拠）
    expect(result).not.toHaveProperty("error");
    expect(result).not.toHaveProperty("message");
    expect(result).not.toHaveProperty("data");
    expect(result).not.toHaveProperty("success");
  });
});
