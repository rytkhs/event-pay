/**
 * Event Creation Data Conversion テスト共通セットアップ
 */

import { getCurrentUser } from "@core/auth/auth-utils";

import { getFutureDateTimeLocal } from "@/tests/helpers/test-datetime";
import type { TestUser } from "@/tests/helpers/test-user";
import { cleanupTestData } from "@/tests/setup/common-cleanup";
import { setupAuthMocks } from "@/tests/setup/common-mocks";
import { createCommonTestSetup } from "@/tests/setup/common-test-setup";

export interface EventCreationDataConversionTestContext {
  testUser: TestUser;
  createdEventIds: string[];
  mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUser>;
  cleanup: () => Promise<void>;
}

export interface EventCreationDataConversionTestOptions {
  /**
   * Stripe Connect設定を含めるか（stripe決済をテストする場合に必要）
   */
  withConnect?: boolean;
}

export async function setupEventCreationDataConversionTest(
  options: EventCreationDataConversionTestOptions = {}
): Promise<EventCreationDataConversionTestContext> {
  const { withConnect = false } = options;

  // 共通セットアップ関数を使用
  const commonSetup = await createCommonTestSetup({
    testName: `data-conversion-test-${Date.now()}`,
    withConnect,
    // Stripe Connect設定オプション
    ...(withConnect && {
      customUserOptions: {
        payoutsEnabled: true,
        chargesEnabled: true,
      },
    }),
  });

  // 認証モックを設定
  const mockGetCurrentUser = setupAuthMocks(commonSetup.testUser);

  return {
    testUser: commonSetup.testUser,
    createdEventIds: [],
    mockGetCurrentUser,
    cleanup: commonSetup.cleanup,
  };
}

export function setupBeforeEach(context: EventCreationDataConversionTestContext): void {
  // 各テストでユーザーを認証済み状態にする
  context.mockGetCurrentUser.mockResolvedValue({
    id: context.testUser.id,
    email: context.testUser.email,
    user_metadata: {},
    app_metadata: {},
  } as any);
}

export function cleanupAfterEach(context: EventCreationDataConversionTestContext): void {
  // モックをリセット
  context.mockGetCurrentUser.mockReset();
}

export async function cleanupAfterAll(
  context: EventCreationDataConversionTestContext
): Promise<void> {
  try {
    // テスト実行（必要に応じて）
  } finally {
    // 必ずクリーンアップを実行
    await cleanupTestData({ eventIds: context.createdEventIds });
    await context.cleanup();
  }
}

/**
 * テストヘルパー: FormDataを作成する
 */
export function createFormDataFromFields(fields: Record<string, string | string[]>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      formData.append(key, value.join(","));
    } else {
      formData.append(key, value);
    }
  }

  return formData;
}

/**
 * テストヘルパー: 将来の日時を生成する（共通ヘルパーを使用）
 */
export function getFutureDateTime(hoursFromNow: number = 24): string {
  return getFutureDateTimeLocal(hoursFromNow);
}
