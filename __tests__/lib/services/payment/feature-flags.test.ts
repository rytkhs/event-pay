/**
 * 決済サービス機能フラグのテスト
 */

import { isDestinationChargesEnabled, getFeatureFlagStatus } from "@/lib/services/payment/feature-flags";

describe("Payment Feature Flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isDestinationChargesEnabled", () => {
    it('環境変数が"true"の場合はtrueを返す', () => {
      process.env.USE_DESTINATION_CHARGES = "true";
      expect(isDestinationChargesEnabled()).toBe(true);
    });

    it('環境変数が"false"の場合はfalseを返す', () => {
      process.env.USE_DESTINATION_CHARGES = "false";
      expect(isDestinationChargesEnabled()).toBe(false);
    });

    it("環境変数が未設定の場合はfalseを返す", () => {
      delete process.env.USE_DESTINATION_CHARGES;
      expect(isDestinationChargesEnabled()).toBe(false);
    });

    it('環境変数が"true"以外の文字列の場合はfalseを返す', () => {
      process.env.USE_DESTINATION_CHARGES = "TRUE";
      expect(isDestinationChargesEnabled()).toBe(false);

      process.env.USE_DESTINATION_CHARGES = "1";
      expect(isDestinationChargesEnabled()).toBe(false);

      process.env.USE_DESTINATION_CHARGES = "yes";
      expect(isDestinationChargesEnabled()).toBe(false);

      process.env.USE_DESTINATION_CHARGES = "enabled";
      expect(isDestinationChargesEnabled()).toBe(false);
    });
  });

  describe("getFeatureFlagStatus", () => {
    it("すべての機能フラグの状態を返す", () => {
      process.env.USE_DESTINATION_CHARGES = "true";

      const status = getFeatureFlagStatus();

      expect(status).toEqual({
        isDestinationChargesEnabled: true,
      });
    });

    it("機能フラグが無効な場合の状態を返す", () => {
      process.env.USE_DESTINATION_CHARGES = "false";

      const status = getFeatureFlagStatus();

      expect(status).toEqual({
        isDestinationChargesEnabled: false,
      });
    });
  });
});
