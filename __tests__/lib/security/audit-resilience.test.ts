/**
 * EventPay 監査レジリエンス テスト
 *
 * 監査ログの失敗に対する回復力をテスト
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { getGuestTokenValidator } from "@/lib/security";
import { GuestErrorCode } from "@/lib/security/secure-client-factory.types";

describe("監査レジリエンス", () => {
  beforeEach(() => {
    // 環境変数を設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  describe("基本的なレジリエンス", () => {
    it("無効なトークンフォーマットの場合、監査ログ失敗に関係なく適切なエラーを返すべき", async () => {
      const validator = getGuestTokenValidator();

      // コンソール警告をキャプチャ
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const invalidToken = "invalid-token";

      // バリデーションを実行
      const result = await validator.validateToken(invalidToken);

      // 結果が正しいことを確認
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(GuestErrorCode.INVALID_FORMAT);
      expect(result.canModify).toBe(false);

      // 監査ログの失敗が警告として出力されたことを確認
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to log guest access audit:",
        expect.objectContaining({
          token: "invalid-...",
          action: "VALIDATE_TOKEN",
          success: false,
        })
      );

      consoleSpy.mockRestore();
    });

    it("トークンフォーマット検証は監査ログに依存せず動作するべき", () => {
      const validator = getGuestTokenValidator();

      // 有効なフォーマット
      expect(validator.validateTokenFormat("gst_" + "a".repeat(32))).toBe(true);
      expect(validator.validateTokenFormat("gst_" + "1".repeat(32))).toBe(true);
      expect(validator.validateTokenFormat("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")).toBe(true);

      // 無効なフォーマット
      expect(validator.validateTokenFormat("short")).toBe(false);
      expect(validator.validateTokenFormat("a".repeat(33))).toBe(false);
      expect(validator.validateTokenFormat("a".repeat(31) + "!")).toBe(false);
      expect(validator.validateTokenFormat("")).toBe(false);
    });
  });

  describe("エラーハンドリングの分離", () => {
    it("ビジネスロジックエラーと監査エラーが適切に分離されるべき", async () => {
      const validator = getGuestTokenValidator();

      // コンソール警告をキャプチャ
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      // 様々な無効なトークンをテスト
      const invalidTokens = [
        { token: "", expectedError: GuestErrorCode.INVALID_FORMAT },
        { token: "short", expectedError: GuestErrorCode.INVALID_FORMAT },
        { token: "a".repeat(33), expectedError: GuestErrorCode.INVALID_FORMAT },
        { token: "a".repeat(31) + "!", expectedError: GuestErrorCode.INVALID_FORMAT },
      ];

      for (const { token, expectedError } of invalidTokens) {
        const result = await validator.validateToken(token);

        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe(expectedError);
        expect(result.canModify).toBe(false);
      }

      // 監査ログの失敗が複数回警告として出力されたことを確認
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("セキュリティ保護", () => {
    it("監査ログ失敗時でもトークンの機密性が保護されるべき", async () => {
      const validator = getGuestTokenValidator();

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const sensitiveToken = "secrettoken123456789012345678901";

      await validator.validateToken(sensitiveToken);

      // コンソール出力を確認
      const warningCalls = consoleSpy.mock.calls;

      // トークンの全体が出力されていないことを確認
      warningCalls.forEach((call) => {
        const loggedData = call[1];
        if (loggedData && typeof loggedData === "object" && "token" in loggedData) {
          expect(loggedData.token).not.toBe(sensitiveToken);
          expect(loggedData.token).toMatch(/^.{8}\.\.\.$/); // 8文字 + '...'
        }
      });

      consoleSpy.mockRestore();
    });
  });

  describe("パフォーマンス特性", () => {
    it("監査ログ失敗が処理を大幅に遅延させないべき", async () => {
      const validator = getGuestTokenValidator();

      // コンソール警告を無効化
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const startTime = Date.now();

      // 複数の無効なトークンを並行処理
      const promises = Array.from({ length: 5 }, (_, i) =>
        validator.validateToken(`invalid-token-${i}`)
      );

      const results = await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // すべての結果が正しいことを確認
      results.forEach((result) => {
        expect(result.isValid).toBe(false);
        expect(result.errorCode).toBe(GuestErrorCode.INVALID_FORMAT);
      });

      // 処理時間が合理的な範囲内であることを確認
      expect(duration).toBeLessThan(5000); // 5秒以内

      consoleSpy.mockRestore();
    });
  });
});
