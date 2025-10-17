/**
 * テストデータシード管理
 *
 * テスト実行前の初期データセットアップとクリーンアップ
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
 * グローバルテストデータの管理
 */
class TestDataManager {
  private static instance: TestDataManager;
  private testData: TestDataSeed | null = null;
  private isSetup = false;

  private constructor() {}

  static getInstance(): TestDataManager {
    if (!TestDataManager.instance) {
      TestDataManager.instance = new TestDataManager();
    }
    return TestDataManager.instance;
  }

  /**
   * テストデータを初期化
   */
  async setupTestData(scenarioName: string = "global-payment-test"): Promise<TestDataSeed> {
    if (this.isSetup && this.testData) {
      // eslint-disable-next-line no-console
      console.log("✓ Using existing test data");
      return this.testData;
    }

    // eslint-disable-next-line no-console
    console.log("🔄 Setting up test data...");

    try {
      const scenario = await createCompleteTestScenario(scenarioName);

      this.testData = {
        users: {
          withConnect: scenario.userWithConnect,
          withoutConnect: scenario.userWithoutConnect,
          disabledPayouts: scenario.userWithDisabledPayouts,
        },
        events: {
          paid: scenario.paidEvent,
          free: scenario.freeEvent,
        },
        attendances: [scenario.attendance],
        payments: {
          pending: scenario.pendingPayment,
          withExistingAmount: scenario.existingAmountPayment,
        },
      };

      this.isSetup = true;
      // eslint-disable-next-line no-console
      console.log("✅ Test data setup completed");
      return this.testData;
    } catch (error) {
      console.error("❌ Failed to setup test data:", error);
      throw error;
    }
  }

  /**
   * テストデータを取得
   */
  getTestData(): TestDataSeed {
    if (!this.testData) {
      throw new Error("Test data not initialized. Call setupTestData() first.");
    }
    return this.testData;
  }

  /**
   * テストデータをクリーンアップ
   */
  async cleanupTestData(): Promise<void> {
    if (!this.testData) {
      // eslint-disable-next-line no-console
      console.log("No test data to cleanup");
      return;
    }

    // eslint-disable-next-line no-console
    console.log("🧹 Cleaning up test data...");

    try {
      // データベースのクリーンアップ
      await cleanupTestPaymentData({
        paymentIds: [
          this.testData.payments.pending.id,
          this.testData.payments.withExistingAmount.id,
        ],
        attendanceIds: this.testData.attendances.map((a) => a.id),
        eventIds: [this.testData.events.paid.id, this.testData.events.free.id],
        userIds: [
          this.testData.users.withConnect.id,
          this.testData.users.withoutConnect.id,
          this.testData.users.disabledPayouts.id,
        ],
      });

      // ユーザーの削除
      await Promise.allSettled([
        deleteTestUser(this.testData.users.withConnect.email),
        deleteTestUser(this.testData.users.withoutConnect.email),
        deleteTestUser(this.testData.users.disabledPayouts.email),
      ]);

      this.testData = null;
      this.isSetup = false;
      // eslint-disable-next-line no-console
      console.log("✅ Test data cleanup completed");
    } catch (error) {
      console.error("❌ Error during test data cleanup:", error);
      throw error;
    }
  }

  /**
   * 特定のテストシナリオ用データを作成
   */
  async createScenarioData(scenarioName: string): Promise<TestDataSeed> {
    const scenario = await createCompleteTestScenario(scenarioName);

    return {
      users: {
        withConnect: scenario.userWithConnect,
        withoutConnect: scenario.userWithoutConnect,
        disabledPayouts: scenario.userWithDisabledPayouts,
      },
      events: {
        paid: scenario.paidEvent,
        free: scenario.freeEvent,
      },
      attendances: [scenario.attendance],
      payments: {
        pending: scenario.pendingPayment,
        withExistingAmount: scenario.existingAmountPayment,
      },
    };
  }
}

/**
 * グローバルテストデータマネージャーのインスタンス
 */
export const testDataManager = TestDataManager.getInstance();

/**
 * Jest用のセットアップフック
 */
export async function setupPaymentTestData(): Promise<TestDataSeed> {
  return await testDataManager.setupTestData();
}

/**
 * Jest用のクリーンアップフック
 */
export async function cleanupPaymentTestData(): Promise<void> {
  await testDataManager.cleanupTestData();
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
