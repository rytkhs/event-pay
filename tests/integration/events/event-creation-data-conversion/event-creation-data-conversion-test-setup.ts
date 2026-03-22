/**
 * Event Creation Data Conversion テスト共通セットアップ
 */

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { resolveCurrentCommunityForServerAction } from "@core/community/current-community";
import { okResult } from "@core/errors/app-result";

import { createOwnedCommunityFixture } from "@/tests/helpers/community-owner-fixtures";
import { getFutureDateTimeLocal } from "@/tests/helpers/test-datetime";
import type { TestUser } from "@/tests/helpers/test-user";
import { cleanupTestData } from "@/tests/setup/common-cleanup";
import { setupAuthMocks } from "@/tests/setup/common-mocks";
import {
  createCommonTestSetup,
  createTestDataCleanupHelper,
} from "@/tests/setup/common-test-setup";

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerAction: jest.fn(),
}));

export interface EventCreationDataConversionTestContext {
  testUser: TestUser;
  createdEventIds: string[];
  mockGetCurrentUser: jest.MockedFunction<typeof getCurrentUserForServerAction>;
  mockResolveCurrentCommunity: jest.MockedFunction<typeof resolveCurrentCommunityForServerAction>;
  currentCommunity: {
    id: string;
    name: string;
    slug: string;
  };
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
  const cleanupHelper = commonSetup.adminClient
    ? createTestDataCleanupHelper(commonSetup.adminClient)
    : null;
  const ownedCommunity = await createOwnedCommunityFixture(commonSetup.testUser.id, {
    withPayoutProfile: withConnect,
  });
  const mockResolveCurrentCommunity = resolveCurrentCommunityForServerAction as jest.MockedFunction<
    typeof resolveCurrentCommunityForServerAction
  >;

  if (cleanupHelper) {
    cleanupHelper.trackCommunity(ownedCommunity.community.id);
    if (ownedCommunity.payoutProfileId) {
      cleanupHelper.trackPayoutProfile(ownedCommunity.payoutProfileId);
    }
  }

  mockResolveCurrentCommunity.mockResolvedValue(
    okResult({
      cookieMutation: "none",
      currentCommunity: {
        createdAt: new Date().toISOString(),
        id: ownedCommunity.community.id,
        name: ownedCommunity.community.name,
        slug: ownedCommunity.community.slug,
      },
      ownedCommunities: [
        {
          createdAt: new Date().toISOString(),
          id: ownedCommunity.community.id,
          name: ownedCommunity.community.name,
          slug: ownedCommunity.community.slug,
        },
      ],
      requestedCommunityId: ownedCommunity.community.id,
      resolvedBy: "cookie",
    })
  );

  return {
    testUser: commonSetup.testUser,
    createdEventIds: [],
    currentCommunity: ownedCommunity.community,
    mockGetCurrentUser,
    mockResolveCurrentCommunity,
    cleanup: async () => {
      await cleanupHelper?.cleanup();
      await commonSetup.cleanup();
    },
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
  context.mockResolveCurrentCommunity.mockResolvedValue(
    okResult({
      cookieMutation: "none",
      currentCommunity: {
        createdAt: new Date().toISOString(),
        id: context.currentCommunity.id,
        name: context.currentCommunity.name,
        slug: context.currentCommunity.slug,
      },
      ownedCommunities: [
        {
          createdAt: new Date().toISOString(),
          id: context.currentCommunity.id,
          name: context.currentCommunity.name,
          slug: context.currentCommunity.slug,
        },
      ],
      requestedCommunityId: context.currentCommunity.id,
      resolvedBy: "cookie",
    })
  );
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
