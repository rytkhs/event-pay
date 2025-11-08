/**
 * Stripe Connect Real API統合テスト共通セットアップ
 */

import { logger } from "@core/logging/app-logger";

import { StripeConnectService } from "@features/stripe-connect/services/service";

import type { TestUser } from "@tests/helpers/test-user";
import { createCommonTestSetup } from "@tests/setup/common-test-setup";

export interface StripeConnectRealApiTestSetup {
  service: StripeConnectService;
  testUser: TestUser;
  createdStripeAccountIds: string[];
  cleanup: () => Promise<void>;
}

/**
 * Stripe Connect Real API統合テストのセットアップ
 *
 * @returns テストデータとサービスを含むセットアップオブジェクト
 */
export async function setupStripeConnectRealApiTest(): Promise<StripeConnectRealApiTestSetup> {
  // 共通セットアップ関数を使用
  const commonSetup = await createCommonTestSetup({
    testName: `stripe-connect-test-${Date.now()}`,
    withConnect: false,
    accessedTables: ["public.users"],
  });

  // StripeConnectServiceを作成（実Supabaseクライアントを使用）
  const service = new StripeConnectService(commonSetup.adminClient);

  const createdStripeAccountIds: string[] = [];

  logger.info("Integration test setup completed", {
    testUserId: commonSetup.testUser.id,
    useRealAPI: true,
  });

  return {
    service,
    testUser: commonSetup.testUser,
    createdStripeAccountIds,
    cleanup: commonSetup.cleanup,
  };
}
