/**
 * レート制限設定のテスト
 * 要件に従った設定値が正しく定義されているかを確認
 */

import { RATE_LIMIT_CONFIG } from "@/config/security";

describe("Rate Limit Configuration", () => {
  describe("招待リンクと参加登録のレート制限設定", () => {
    it("招待リンクのレート制限設定が要件を満たしていること", () => {
      const inviteConfig = RATE_LIMIT_CONFIG.invite;

      // 要件: 5分間のウィンドウで10リクエストまで
      expect(inviteConfig.windowMs).toBe(5 * 60 * 1000); // 5分
      expect(inviteConfig.maxAttempts).toBe(10); // 10回まで
      expect(inviteConfig.blockDurationMs).toBe(15 * 60 * 1000); // 15分ブロック
    });

    it("参加登録のレート制限設定が要件を満たしていること", () => {
      const participationConfig = RATE_LIMIT_CONFIG.participation;

      // 要件: 5分間のウィンドウで10リクエストまで
      expect(participationConfig.windowMs).toBe(5 * 60 * 1000); // 5分
      expect(participationConfig.maxAttempts).toBe(10); // 10回まで
      expect(participationConfig.blockDurationMs).toBe(15 * 60 * 1000); // 15分ブロック
    });

    it("招待リンクと参加登録のレート制限設定が同じであること", () => {
      expect(RATE_LIMIT_CONFIG.invite).toEqual(RATE_LIMIT_CONFIG.participation);
    });
  });

  describe("その他のレート制限設定", () => {
    it("ゲスト管理のレート制限設定が適切であること", () => {
      const guestConfig = RATE_LIMIT_CONFIG.guest;

      expect(guestConfig.windowMs).toBe(5 * 60 * 1000); // 5分
      expect(guestConfig.maxAttempts).toBe(15); // 15回まで（自己管理のため多め）
      expect(guestConfig.blockDurationMs).toBe(15 * 60 * 1000); // 15分ブロック
    });

    it("認証関連のレート制限設定が適切であること", () => {
      const loginConfig = RATE_LIMIT_CONFIG.login;
      const registerConfig = RATE_LIMIT_CONFIG.register;

      expect(loginConfig.windowMs).toBe(15 * 60 * 1000); // 15分
      expect(loginConfig.maxAttempts).toBe(10); // 10回まで

      expect(registerConfig.windowMs).toBe(15 * 60 * 1000); // 15分
      expect(registerConfig.maxAttempts).toBe(5); // 5回まで
    });
  });

  describe("設定値の妥当性", () => {
    it("すべてのレート制限設定が正の値であること", () => {
      Object.values(RATE_LIMIT_CONFIG).forEach((config) => {
        expect(config.windowMs).toBeGreaterThan(0);
        expect(config.maxAttempts).toBeGreaterThan(0);
        expect(config.blockDurationMs).toBeGreaterThan(0);
      });
    });

    it("ブロック期間がウィンドウ期間より長いこと", () => {
      Object.values(RATE_LIMIT_CONFIG).forEach((config) => {
        expect(config.blockDurationMs).toBeGreaterThanOrEqual(config.windowMs);
      });
    });
  });
});
