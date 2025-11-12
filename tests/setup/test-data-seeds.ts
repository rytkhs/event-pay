/**
 * テストデータシード管理
 *
 * テスト実行前の初期データセットアップとクリーンアップ
 * テストごとに独立したデータを生成する関数ベースの設計
 */

import {
  createCompleteTestScenario,
  createTestUserWithConnect,
  createTestUserWithoutConnect,
  createTestUserWithDisabledPayouts,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
  type TestPaymentData,
} from "../helpers/test-payment-data";
import { deleteTestUser } from "../helpers/test-user";

export interface TestDataSeed {
  users: {
    withConnect: TestPaymentUser;
    withoutConnect: TestPaymentUser;
    disabledPayouts: TestPaymentUser;
  };
  events: {
    paid: TestPaymentEvent;
    free: TestPaymentEvent;
  };
  attendances: TestAttendanceData[];
  payments: {
    pending: TestPaymentData;
    withExistingAmount: TestPaymentData;
  };
}

/**
 * テストごとに新しいデータセットを作成
 *
 * @param scenarioName テストシナリオ名（省略時は一意の名前を自動生成）
 * @returns テストデータシード
 */
export async function createTestDataSeed(scenarioName?: string): Promise<TestDataSeed> {
  const name = scenarioName || `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // eslint-disable-next-line no-console
  console.log(`🔄 Setting up test data: ${name}`);

  try {
    const scenario = await createCompleteTestScenario(name);

    const testData: TestDataSeed = {
      users: {
        withConnect: scenario.userWithConnect,
        withoutConnect: scenario.userWithoutConnect,
        disabledPayouts: scenario.userWithDisabledPayouts,
      },
      events: {
        paid: scenario.paidEvent,
        free: scenario.freeEvent,
      },
      attendances: [scenario.attendance, scenario.attendanceForExistingAmount],
      payments: {
        pending: scenario.pendingPayment,
        withExistingAmount: scenario.existingAmountPayment,
      },
    };

    // eslint-disable-next-line no-console
    console.log(`✅ Test data setup completed: ${name}`);
    return testData;
  } catch (error) {
    console.error(`❌ Failed to setup test data: ${name}`, error);
    throw error;
  }
}

/**
 * 特定のテストデータをクリーンアップ
 *
 * @param testData クリーンアップするテストデータ
 */
export async function cleanupTestDataSeed(testData: TestDataSeed): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("🧹 Cleaning up test data...");

  try {
    // データベースのクリーンアップ
    await cleanupTestPaymentData({
      paymentIds: [testData.payments.pending.id, testData.payments.withExistingAmount.id],
      attendanceIds: testData.attendances.map((a) => a.id),
      eventIds: [testData.events.paid.id, testData.events.free.id],
      userIds: [
        testData.users.withConnect.id,
        testData.users.withoutConnect.id,
        testData.users.disabledPayouts.id,
      ],
    });

    // ユーザーの削除
    await Promise.allSettled([
      deleteTestUser(testData.users.withConnect.email),
      deleteTestUser(testData.users.withoutConnect.email),
      deleteTestUser(testData.users.disabledPayouts.email),
    ]);

    // eslint-disable-next-line no-console
    console.log("✅ Test data cleanup completed");
  } catch (error) {
    console.error("❌ Error during test data cleanup:", error);
    throw error;
  }
}

/**
 * Jest用のセットアップフック（後方互換性のため）
 *
 * @deprecated createTestDataSeed() を使用してください
 */
export async function setupPaymentTestData(scenarioName?: string): Promise<TestDataSeed> {
  return await createTestDataSeed(scenarioName);
}

/**
 * Jest用のクリーンアップフック（後方互換性のため）
 *
 * @deprecated cleanupTestDataSeed() を使用してください
 */
export async function cleanupPaymentTestData(testData: TestDataSeed): Promise<void> {
  await cleanupTestDataSeed(testData);
}

/**
 * 個別テスト用のミニマルデータセット
 */
export async function createMinimalTestData(): Promise<{
  userWithConnect: TestPaymentUser;
  userWithoutConnect: TestPaymentUser;
}> {
  const [userWithConnect, userWithoutConnect] = await Promise.all([
    createTestUserWithConnect(),
    createTestUserWithoutConnect(),
  ]);

  return { userWithConnect, userWithoutConnect };
}

/**
 * Connect関連テスト専用データセット
 */
export async function createConnectTestData(): Promise<{
  activeUser: TestPaymentUser;
  payoutsDisabledUser: TestPaymentUser;
  noConnectUser: TestPaymentUser;
}> {
  const [activeUser, payoutsDisabledUser, noConnectUser] = await Promise.all([
    createTestUserWithConnect(),
    createTestUserWithDisabledPayouts(),
    createTestUserWithoutConnect(),
  ]);

  return { activeUser, payoutsDisabledUser, noConnectUser };
}

/**
 * テスト環境の健全性チェック
 */
export async function verifyTestEnvironment(): Promise<{
  supabaseConnected: boolean;
  testDataAccessible: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let supabaseConnected = false;
  let testDataAccessible = false;

  try {
    // Supabase接続テスト
    const testUser = await createTestUserWithoutConnect(`health-check-${Date.now()}@example.com`);
    supabaseConnected = true;

    // テストデータアクセステスト
    await deleteTestUser(testUser.email);
    testDataAccessible = true;
  } catch (error) {
    errors.push(`Test environment check failed: ${error}`);
  }

  return {
    supabaseConnected,
    testDataAccessible,
    errors,
  };
}

/**
 * テストデータの統計情報を取得
 */
export function getTestDataStats(testData: TestDataSeed): {
  userCount: number;
  eventCount: number;
  attendanceCount: number;
  paymentCount: number;
  connectAccountCount: number;
} {
  return {
    userCount: Object.keys(testData.users).length,
    eventCount: Object.keys(testData.events).length,
    attendanceCount: testData.attendances.length,
    paymentCount: Object.keys(testData.payments).length,
    connectAccountCount: Object.values(testData.users).filter((u) => u.hasStripeConnect).length,
  };
}
