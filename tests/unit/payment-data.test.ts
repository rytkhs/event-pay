/**
 * 決済テスト用データ作成のテスト
 */

import { TEST_CARD_NUMBERS, TEST_PAYMENT_AMOUNTS } from "../helpers/test-payment-data";
import { testDataManager } from "../setup/test-data-seeds";

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

  it("テストデータマネージャーが正常にインスタンス化される", () => {
    expect(testDataManager).toBeDefined();
    expect(typeof testDataManager.getTestData).toBe("function");
    expect(typeof testDataManager.setupTestData).toBe("function");
    expect(typeof testDataManager.cleanupTestData).toBe("function");
  });

  it("テストデータマネージャーが未初期化時にエラーを投げる", () => {
    expect(() => testDataManager.getTestData()).toThrow(
      "Test data not initialized. Call setupTestData() first."
    );
  });
});
