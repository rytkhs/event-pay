/**
 * 決済テスト用データ作成のテスト
 */

import {
  TEST_CARD_NUMBERS,
  TEST_PAYMENT_AMOUNTS,
  cleanupTestPaymentData,
} from "../helpers/test-payment-data";
import { deleteTestUser } from "../helpers/test-user";
import {
  createTestDataSeed,
  cleanupTestDataSeed,
  createMinimalTestData,
  createConnectTestData,
  getTestDataStats,
  type TestDataSeed,
} from "../setup/test-data-seeds";

describe("決済テスト用データ", () => {
  it("テストカード番号が定義されている", () => {
    expect(TEST_CARD_NUMBERS.VISA_SUCCESS).toBe("4242424242424242");
    expect(TEST_CARD_NUMBERS.CARD_DECLINED).toBe("4000000000000002");
    expect(TEST_CARD_NUMBERS.INSUFFICIENT_FUNDS).toBe("4000000000009995");
  });

  it("テスト用決済金額が定義されている", () => {
    expect(TEST_PAYMENT_AMOUNTS.SMALL).toBe(500);
    expect(TEST_PAYMENT_AMOUNTS.MEDIUM).toBe(1000);
    expect(TEST_PAYMENT_AMOUNTS.LARGE).toBe(5000);
    expect(TEST_PAYMENT_AMOUNTS.VERY_LARGE).toBe(10000);
  });

  describe("テストデータシード関数", () => {
    let testData: TestDataSeed;

    afterEach(async () => {
      if (testData) {
        await cleanupTestDataSeed(testData);
      }
    });

    it("createTestDataSeed()が正常にデータを作成する", async () => {
      testData = await createTestDataSeed("test-scenario");
      expect(testData).toBeDefined();
      expect(testData.users.withConnect).toBeDefined();
      expect(testData.users.withoutConnect).toBeDefined();
      expect(testData.users.disabledPayouts).toBeDefined();
      expect(testData.events.paid).toBeDefined();
      expect(testData.events.free).toBeDefined();
      expect(testData.attendances.length).toBeGreaterThan(0);
      expect(testData.payments.pending).toBeDefined();
      expect(testData.payments.withExistingAmount).toBeDefined();
    });

    it("createMinimalTestData()が正常にデータを作成する", async () => {
      const minimalData = await createMinimalTestData();
      expect(minimalData.userWithConnect).toBeDefined();
      expect(minimalData.userWithoutConnect).toBeDefined();
      // クリーンアップ
      await cleanupTestPaymentData({
        userIds: [minimalData.userWithConnect.id, minimalData.userWithoutConnect.id],
      });
      await deleteTestUser(minimalData.userWithConnect.email);
      await deleteTestUser(minimalData.userWithoutConnect.email);
    });

    it("createConnectTestData()が正常にデータを作成する", async () => {
      const connectData = await createConnectTestData();
      expect(connectData.activeUser).toBeDefined();
      expect(connectData.payoutsDisabledUser).toBeDefined();
      expect(connectData.noConnectUser).toBeDefined();
      // クリーンアップ
      await cleanupTestPaymentData({
        userIds: [
          connectData.activeUser.id,
          connectData.payoutsDisabledUser.id,
          connectData.noConnectUser.id,
        ],
      });
      await deleteTestUser(connectData.activeUser.email);
      await deleteTestUser(connectData.payoutsDisabledUser.email);
      await deleteTestUser(connectData.noConnectUser.email);
    });

    it("getTestDataStats()が正常に統計情報を返す", async () => {
      testData = await createTestDataSeed("test-stats");
      const stats = getTestDataStats(testData);
      expect(stats.userCount).toBe(3);
      expect(stats.eventCount).toBe(2);
      expect(stats.attendanceCount).toBeGreaterThan(0);
      expect(stats.paymentCount).toBe(2);
      expect(stats.connectAccountCount).toBeGreaterThan(0);
    });
  });
});
