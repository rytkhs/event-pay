/**
 * 決済サービス機能フラグのテスト
 */

import { isDestinationChargesEnabled, getFeatureFlagStatus } from "@/lib/services/payment/feature-flags";

describe("Payment Feature Flags", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe("isDestinationChargesEnabled", () => {
    it("常にtrueを返す", () => {
      expect(isDestinationChargesEnabled()).toBe(true);
    });
  });

  describe("getFeatureFlagStatus", () => {
    it("常にtrueの状態を返す", () => {
      const status = getFeatureFlagStatus();
      expect(status).toEqual({ isDestinationChargesEnabled: true });
    });
  });
});
