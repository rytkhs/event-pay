/**
 * Verify Session API: セキュリティテスト
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

import { createPaidTestEvent, createTestAttendance } from "@tests/helpers/test-payment-data";
import type { ErrorScenario } from "@tests/helpers/test-verify-session";
import { cleanupTestData } from "@tests/setup/common-cleanup";
import { createCommonTestSetup } from "@tests/setup/common-test-setup";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("🔒 セキュリティテスト", () => {
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

  test("権限確認 - 他人の参加記録へのアクセス試行", async () => {
    // 別のユーザーの参加記録を作成（共通セットアップ関数を使用）
    const anotherUserSetup = await createCommonTestSetup({
      testName: `security-test-another-user-${Date.now()}`,
      withConnect: true,
      withEvent: false,
    });
    const anotherUser = anotherUserSetup.testUser;
    // 注意: テスト内での追加データ作成のため、個別関数を使用
    // これは「他人のデータ」を作成する必要があるため、共通セットアップ関数では対応不可
    const anotherEvent = await createPaidTestEvent(anotherUser.id);
    const anotherAttendance = await createTestAttendance(anotherEvent.id);

    try {
      const unauthorizedScenario: ErrorScenario = {
        name: "他人の参加記録へのアクセス試行",
        requestConfig: {
          sessionId: "cs_test_unauthorized_access",
          attendanceId: anotherAttendance.id,
          guestToken: context.testSetup.attendance.guest_token,
        },
        expectedStatus: 404,
      };

      const result = await context.testHelper.runErrorScenario(
        unauthorizedScenario,
        verifySessionHandler
      );
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");

      // セキュリティログ記録確認
      expect(context.mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SUSPICIOUS_ACTIVITY",
          severity: "HIGH",
          message: expect.stringContaining("token mismatch"),
        })
      );
    } finally {
      // クリーンアップ
      await cleanupTestData({
        attendanceIds: [anotherAttendance.id],
        eventIds: [anotherEvent.id],
        userEmails: [anotherUser.email],
      });
      await anotherUserSetup.cleanup();
    }
  });

  test("入力サニタイゼーション - SQLインジェクション試行", async () => {
    const maliciousInput = "'; DROP TABLE payments; --";
    const sqliScenario: ErrorScenario = {
      name: "SQLインジェクション試行 → 安全にエラーレスポンス",
      requestConfig: {
        sessionId: maliciousInput,
        attendanceId: context.testSetup.attendance.id,
      },
      expectedStatus: 404, // SQLインジェクションが無効化されてStripe APIエラー
    };

    const result = await context.testHelper.runErrorScenario(sqliScenario, verifySessionHandler);
    expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
  });
});
