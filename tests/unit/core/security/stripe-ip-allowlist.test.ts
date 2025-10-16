/**
 * @jest-environment node
 */

import { shouldEnforceStripeWebhookIpCheck } from "../../../../core/security/stripe-ip-allowlist";

describe("shouldEnforceStripeWebhookIpCheck", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("明示的無効化パターン", () => {
    test.each(["false", "0", "no", "off", "FALSE", "Off", "NO", "OFF"])(
      "ENABLE_STRIPE_IP_CHECK='%s' で本番環境でもfalseを返す",
      (value) => {
        process.env.ENABLE_STRIPE_IP_CHECK = value;
        process.env.NODE_ENV = "production"; // 本番でも無効化

        const result = shouldEnforceStripeWebhookIpCheck();

        expect(result).toBe(false);
      }
    );

    test("ENABLE_STRIPE_IP_CHECK='false' で前後空白があってもfalseを返す", () => {
      process.env.ENABLE_STRIPE_IP_CHECK = " false ";
      process.env.NODE_ENV = "production";

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(false);
    });
  });

  describe("明示的有効化パターン", () => {
    test.each(["true", "1", "yes", "on", "TRUE", "On", "YES", "ON"])(
      "ENABLE_STRIPE_IP_CHECK='%s' でテスト環境でもtrueを返す",
      (value) => {
        process.env.ENABLE_STRIPE_IP_CHECK = value;
        process.env.NODE_ENV = "test"; // テスト環境でも有効化

        const result = shouldEnforceStripeWebhookIpCheck();

        expect(result).toBe(true);
      }
    );

    test("ENABLE_STRIPE_IP_CHECK='true' で本番環境でもtrueを返す", () => {
      process.env.ENABLE_STRIPE_IP_CHECK = "true";
      process.env.NODE_ENV = "production";

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(true);
    });

    test("ENABLE_STRIPE_IP_CHECK='true' で前後空白があってもtrueを返す", () => {
      process.env.ENABLE_STRIPE_IP_CHECK = " true ";
      process.env.NODE_ENV = "test";

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(true);
    });
  });

  describe("デフォルト動作パターン", () => {
    test.each([undefined, "", " ", "   ", "invalid", "maybe", "2", "unknown"])(
      "ENABLE_STRIPE_IP_CHECK='%s' で本番環境のみtrueを返す（isProduction依存）",
      (value) => {
        if (value !== undefined) {
          process.env.ENABLE_STRIPE_IP_CHECK = value;
        } else {
          delete process.env.ENABLE_STRIPE_IP_CHECK;
        }

        // 本番環境での動作確認
        process.env.NODE_ENV = "production";
        expect(shouldEnforceStripeWebhookIpCheck()).toBe(true);

        // テスト環境での動作確認
        process.env.NODE_ENV = "test";
        expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);

        // 開発環境での動作確認
        process.env.NODE_ENV = "development";
        expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);
      }
    );
  });

  describe("環境変数未設定時の動作", () => {
    beforeEach(() => {
      delete process.env.ENABLE_STRIPE_IP_CHECK;
    });

    test("本番環境でtrueを返す", () => {
      process.env.NODE_ENV = "production";

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(true);
    });

    test("テスト環境でfalseを返す", () => {
      process.env.NODE_ENV = "test";

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(false);
    });

    test("開発環境でfalseを返す", () => {
      process.env.NODE_ENV = "development";

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(false);
    });

    test("NODE_ENV未設定でfalseを返す", () => {
      delete process.env.NODE_ENV;

      const result = shouldEnforceStripeWebhookIpCheck();

      expect(result).toBe(false);
    });
  });

  describe("大文字小文字の区別", () => {
    test("Mixed Case で正しく動作する", () => {
      process.env.NODE_ENV = "test";

      // 有効化パターン
      process.env.ENABLE_STRIPE_IP_CHECK = "True";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(true);

      process.env.ENABLE_STRIPE_IP_CHECK = "YES";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(true);

      // 無効化パターン
      process.env.ENABLE_STRIPE_IP_CHECK = "False";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);

      process.env.ENABLE_STRIPE_IP_CHECK = "NO";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("空白のみの値でデフォルト動作", () => {
      process.env.ENABLE_STRIPE_IP_CHECK = "   ";

      process.env.NODE_ENV = "production";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(true);

      process.env.NODE_ENV = "test";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);
    });

    test("数値パターン", () => {
      process.env.NODE_ENV = "test";

      // 有効化数値
      process.env.ENABLE_STRIPE_IP_CHECK = "1";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(true);

      // 無効化数値
      process.env.ENABLE_STRIPE_IP_CHECK = "0";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);

      // その他数値はデフォルト動作
      process.env.ENABLE_STRIPE_IP_CHECK = "2";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(false); // test環境
    });
  });

  describe("後方互換性確認", () => {
    test("既存の無効化パターンが引き続き動作する", () => {
      const legacyValues = ["false", "0", "no", "off"];

      legacyValues.forEach((value) => {
        process.env.ENABLE_STRIPE_IP_CHECK = value;
        process.env.NODE_ENV = "production"; // 本番でも無効化されることを確認

        expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);
      });
    });

    test("未設定時のデフォルト動作が変わっていない", () => {
      delete process.env.ENABLE_STRIPE_IP_CHECK;

      // 本番環境で有効
      process.env.NODE_ENV = "production";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(true);

      // 非本番環境で無効
      process.env.NODE_ENV = "test";
      expect(shouldEnforceStripeWebhookIpCheck()).toBe(false);
    });
  });
});
