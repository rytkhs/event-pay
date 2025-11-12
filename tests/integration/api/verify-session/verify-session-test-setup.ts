/**
 * Verify Session テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import { NextRequest } from "next/server";

import { enforceRateLimit, withRateLimit } from "@core/rate-limit";
import { logSecurityEvent } from "@core/security/security-logger";

import { cleanupTestPaymentData } from "@tests/helpers/test-payment-data";
import { deleteTestUser } from "@tests/helpers/test-user";
import {
  VerifySessionTestHelper,
  type VerifySessionTestSetup,
} from "@tests/helpers/test-verify-session";
import { setupRateLimitMocks, setupSecurityLoggerMocks } from "@tests/setup/common-mocks";

// モックは各テストファイルで宣言する必要があります
// （このファイルではモック宣言を行わない）

export interface VerifySessionTestContext {
  testHelper: VerifySessionTestHelper;
  testSetup: VerifySessionTestSetup;
  mockLogSecurityEvent: jest.MockedFunction<typeof logSecurityEvent>;
  mockEnforceRateLimit: jest.MockedFunction<typeof enforceRateLimit>;
  mockWithRateLimit: jest.MockedFunction<typeof withRateLimit>;
}

export async function setupVerifySessionTest(): Promise<VerifySessionTestContext> {
  // 完全なテストセットアップを作成
  const testSetup = await VerifySessionTestHelper.createCompleteSetup(
    "verify-session-integration-refactored"
  );
  const testHelper = new VerifySessionTestHelper(testSetup);

  // 共通モック設定を使用
  const securityLoggerMock = setupSecurityLoggerMocks();
  const rateLimitMocks = setupRateLimitMocks(true);

  // セキュリティログのモック統合（実際のログ出力を抑制）
  testSetup.mockLogSecurityEvent = securityLoggerMock;

  return {
    testHelper,
    testSetup,
    mockLogSecurityEvent: securityLoggerMock,
    mockEnforceRateLimit: rateLimitMocks.mockEnforceRateLimit,
    mockWithRateLimit: rateLimitMocks.mockWithRateLimit,
  };
}

export function setupBeforeEach(context: VerifySessionTestContext): void {
  // モックをクリア（呼び出し履歴のみクリア、実装は保持）
  context.mockLogSecurityEvent.mockClear();
  context.mockEnforceRateLimit.mockClear();
  context.mockWithRateLimit.mockClear();

  // デフォルトでレート制限は通す（モック化）
  context.mockEnforceRateLimit.mockResolvedValue({ allowed: true });
  context.mockWithRateLimit.mockImplementation((_policy, _keyBuilder) => {
    return async (_request: NextRequest) => {
      return null; // レート制限なし
    };
  });
}

export async function cleanupAfterEach(context: VerifySessionTestContext): Promise<void> {
  // 各テスト後のクリーンアップ
  await context.testHelper.cleanupAttendancePayments(context.testSetup.attendance.id);
}

export async function cleanupAfterAll(context: VerifySessionTestContext): Promise<void> {
  // VerifySessionTestHelperが作成したデータをクリーンアップ
  const { testSetup } = context;
  await cleanupTestPaymentData({
    attendanceIds: [testSetup.attendance.id],
    eventIds: [testSetup.event.id],
    userIds: [testSetup.user.id],
  });
  await deleteTestUser(testSetup.user.email);
}
