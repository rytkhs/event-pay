/**
 * ゲストセッション作成統合テスト共通セットアップ
 *
 * 注意: 統合テスト用の特別なStripe Connectアカウント設定が必要なため、
 * createPaymentTestSetupは使用せず、元の実装を維持しています。
 * ただし、setupFeeConfigForIntegrationTestは共通化されています。
 *
 * 部分的な共通化:
 * - クリーンアップ処理は既に共通ヘルパー関数（cleanupTestPaymentData）を使用
 * - fee_configのセットアップは共通化済み
 * - データ作成処理は統合テスト用の特別な設定が必要なため、個別実装を維持
 */

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "@tests/helpers/test-payment-data";

export interface GuestSessionCreationTestSetup {
  testUser: TestPaymentUser;
  testEvent: TestPaymentEvent;
  testAttendance: TestAttendanceData;
  cleanup: () => Promise<void>;
}

/**
 * 統合テスト用: fee_config デフォルトデータをセットアップ
 * 決済機能の統合テストに必要な最低限の手数料設定を挿入
 */
async function setupFeeConfigForIntegrationTest(): Promise<void> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Setup fee_config for integration tests",
    {
      operationType: "INSERT",
      accessedTables: ["public.fee_config"],
      additionalInfo: {
        testContext: "integration-test-setup",
      },
    }
  );

  try {
    // 既存のfee_configを確認
    const { data: existing } = await adminClient.from("fee_config").select("*").limit(1);

    if (existing && existing.length > 0) {
      // eslint-disable-next-line no-console
      console.log("✓ fee_config already exists, skipping setup");
      return;
    }

    // デフォルト手数料設定を挿入（実際のスキーマに合わせる）
    const { error } = await adminClient.from("fee_config").insert({
      id: 1,
      stripe_base_rate: 0.036, // 3.6%
      stripe_fixed_fee: 0, // 0円
      platform_fee_rate: 0.049, // 4.9%
      platform_fixed_fee: 0, // 0円
      min_platform_fee: 0, // 0円
      max_platform_fee: 0, // 0円
      min_payout_amount: 100, // 100円
      platform_tax_rate: 10.0, // 10%
      is_tax_included: true, // 内税
    });

    if (error) {
      throw new Error(`Failed to setup fee_config: ${error.message}`);
    }

    // eslint-disable-next-line no-console
    console.log("✓ fee_config setup completed for integration tests");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("❌ Failed to setup fee_config:", error);
    throw error;
  }
}

/**
 * ゲストセッション作成統合テストのセットアップ
 *
 * 注意: 統合テスト用の特別なStripe Connectアカウント設定が必要なため、
 * createPaymentTestSetupは使用せず、元の実装を維持しています。
 * ただし、setupFeeConfigForIntegrationTestは共通化されています。
 *
 * @returns テストデータとクリーンアップ関数を含むセットアップオブジェクト
 */
export async function setupGuestSessionCreationTest(): Promise<GuestSessionCreationTestSetup> {
  // 真の統合テストでは実際のDBにテストデータを作成
  // eslint-disable-next-line no-console
  console.log("🔧 統合テスト用データセットアップ開始");

  // 統合テスト用: fee_config デフォルトデータ挿入
  await setupFeeConfigForIntegrationTest();

  // 統合テスト用の特別なStripe Connectアカウント設定が必要なため、
  // createPaymentTestSetupは使用せず、元の実装を維持
  const testUser = await createTestUserWithConnect(
    `integration-test-organizer-${Date.now()}@example.com`,
    "TestPassword123!",
    {
      stripeAccountId: `acct_test_integration_${Math.random().toString(36).slice(2, 10)}`,
      payoutsEnabled: true,
      chargesEnabled: true,
    }
  );

  const testEvent = await createPaidTestEvent(testUser.id, {
    fee: 2500,
    title: "統合テストイベント",
  });

  const testAttendance = await createTestAttendance(testEvent.id, {
    email: "integration-test-guest@example.com",
    nickname: "統合テスト参加者",
    status: "attending",
  });

  // eslint-disable-next-line no-console
  console.log("✅ 統合テスト用データセットアップ完了");

  // クリーンアップ関数
  const cleanup = async () => {
    // eslint-disable-next-line no-console
    console.log("🧹 統合テストデータクリーンアップ開始");
    await cleanupTestPaymentData({
      attendanceIds: [testAttendance.id],
      eventIds: [testEvent.id],
      userIds: [testUser.id],
    });
    // eslint-disable-next-line no-console
    console.log("✅ 統合テストデータクリーンアップ完了");
  };

  return {
    testUser,
    testEvent,
    testAttendance,
    cleanup,
  };
}
