/**
 * Verify Session API: ネットワークエラーテスト
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

import type { ErrorScenario } from "@tests/helpers/test-verify-session";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("🌐 ネットワークエラーテスト", () => {
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

  test("不正な形式のStripe Session IDでのAPI呼び出し", async () => {
    // 不正な形式のセッションIDで実際のAPIエラーをテスト
    const malformedSessionId = "invalid_session_id_format";

    const networkErrorScenario: ErrorScenario = {
      name: "不正形式Session ID → Stripe APIエラー",
      requestConfig: { sessionId: malformedSessionId },
      expectedStatus: 404,
    };

    const result = await context.testHelper.runErrorScenario(
      networkErrorScenario,
      verifySessionHandler
    );
    expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
  });

  test("非常に長いSession IDでのAPI呼び出し", async () => {
    // 異常に長いセッションIDで実際のAPIの堅牢性をテスト
    const overlyLongSessionId = "cs_test_" + "x".repeat(200);

    const edgeCaseScenario: ErrorScenario = {
      name: "異常に長いSession ID → APIエラー",
      requestConfig: { sessionId: overlyLongSessionId },
      expectedStatus: 404,
    };

    const result = await context.testHelper.runErrorScenario(
      edgeCaseScenario,
      verifySessionHandler
    );
    expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
  });
});
