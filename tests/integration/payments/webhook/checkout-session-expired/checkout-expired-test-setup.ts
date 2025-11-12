/**
 * checkout.session.expired Webhook テスト共通セットアップ
 *
 * 共通セットアップ関数と統一モック設定を使用してリファクタリング済み
 */

import { logger } from "../../../../../core/logging/app-logger";
import {
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "../../../../helpers/test-payment-data";
import { setupLoggerMocks } from "../../../../setup/common-mocks";
import { createWebhookTestSetup } from "../../../../setup/common-test-setup";
import { createTestWebhookEvent } from "../../../../setup/stripe-test-helpers";

// 外部依存のモック（統合テストなので最小限）
jest.mock("../../../../../core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

export interface CheckoutExpiredTestSetup {
  supabase: any;
  testUser: TestPaymentUser;
  testEvent: TestPaymentEvent;
  testAttendance: TestAttendanceData;
  mockLogger: jest.Mocked<typeof logger>;
  cleanup: () => Promise<void>;
}

/**
 * テストセットアップを実行
 */
export async function setupCheckoutExpiredTest(): Promise<CheckoutExpiredTestSetup> {
  // ロガーモックを設定
  const mockLogger = setupLoggerMocks();

  // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
  const webhookSetup = await createWebhookTestSetup({
    testName: `checkout-expired-test-${Date.now()}`,
    eventFee: 1500,
    accessedTables: ["public.payments", "public.attendances"],
  });

  // 後方互換性のため、supabaseという名前でエクスポート
  const supabase = webhookSetup.adminClient;

  return {
    supabase,
    testUser: webhookSetup.testUser,
    testEvent: webhookSetup.testEvent,
    testAttendance: webhookSetup.testAttendance,
    mockLogger,
    cleanup: webhookSetup.cleanup,
  };
}

/**
 * テストクリーンアップを実行
 */
export async function cleanupCheckoutExpiredTest(setup: CheckoutExpiredTestSetup): Promise<void> {
  // 共通クリーンアップ関数を使用
  await setup.cleanup();
}

/**
 * Checkout Session Expired イベントを作成
 */
export function createCheckoutExpiredEvent(
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
