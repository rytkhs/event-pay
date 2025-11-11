/**
 * Verify Session API: 異常系テスト
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

// モックは他のインポートより前に宣言する必要がある
jest.mock("@core/security/security-logger");
jest.mock("@core/rate-limit");

import type { ErrorScenario } from "@tests/helpers/test-verify-session";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("❌ 異常系テスト - シナリオベース", () => {
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

  test("認証・認可エラー", async () => {
    const authErrorScenarios: ErrorScenario[] = [
      {
        name: "ゲストトークン欠落 → 400 Bad Request（仕様書準拠）",
        requestConfig: { guestToken: "" },
        expectedStatus: 400,
        expectedMessage: "ゲストトークンが必要です",
      },
      {
        name: "ゲストトークン不一致 → 404 Not Found（仕様書準拠）",
        requestConfig: {
          sessionId: "cs_test_guest_token_mismatch",
          guestToken: "invalid_guest_token_123",
        },
        expectedStatus: 404,
      },
    ];

    for (const scenario of authErrorScenarios) {
      const result = await context.testHelper.runErrorScenario(scenario, verifySessionHandler);

      // 仕様書準拠のエラーレスポンス形式確認
      expect(result).toHaveProperty("type");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("correlation_id");
      expect(result.retryable).toBe(false);
    }

    // セキュリティログは実際の関数が呼ばれるため、モックの検証は不要
    // 実際のログ出力はconsole.errorで確認できる
  });

  test("バリデーションエラー", async () => {
    const validationErrorScenarios: ErrorScenario[] = [
      {
        name: "session_id欠落 → 422 Validation Error（仕様書準拠）",
        requestConfig: { sessionId: "" },
        expectedStatus: 422,
      },
      {
        name: "attendance_id不正（UUID違反） → 422 Validation Error",
        requestConfig: { attendanceId: "invalid-uuid-format" },
        expectedStatus: 422,
      },
      {
        name: "複数バリデーションエラー → まとめてエラー配列に含める",
        requestConfig: {
          sessionId: "",
          attendanceId: "invalid-uuid",
        },
        expectedStatus: 422,
      },
    ];

    for (const scenario of validationErrorScenarios) {
      const result = await context.testHelper.runErrorScenario(scenario, verifySessionHandler);

      // バリデーションエラーの場合はerrorsフィールドが存在
      if (scenario.name.includes("複数")) {
        expect(result.errors).toHaveLength(2);
      } else if (scenario.name.includes("session_id") || scenario.name.includes("attendance_id")) {
        expect(result.errors).toBeDefined();
      }
    }
  });

  test("システムエラー", async () => {
    // 存在しないStripe SessionIDでテスト（実際のAPIエラーを発生させる）
    const systemErrorScenario: ErrorScenario = {
      name: "存在しないStripe SessionID → 404 Not Found",
      requestConfig: { sessionId: "cs_nonexistent_session_id_12345" },
      expectedStatus: 404,
    };

    const result = await context.testHelper.runErrorScenario(
      systemErrorScenario,
      verifySessionHandler
    );
    expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
    expect(result.correlation_id).toBeTruthy();
  });
});
