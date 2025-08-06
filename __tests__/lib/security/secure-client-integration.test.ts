/**
 * EventPay セキュアクライアントファクトリー 統合テスト
 *
 * 実際のSupabaseクライアントとの統合動作を検証
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  getSecureClientFactory,
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
} from "@/lib/security";

describe("セキュアクライアントファクトリー統合テスト", () => {
  beforeEach(() => {
    // 環境変数を設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  describe("基本的なクライアント作成", () => {
    it("各種クライアントが正しく作成されるべき", () => {
      const factory = getSecureClientFactory();

      // 認証済みクライアント
      const authClient = factory.createAuthenticatedClient();
      expect(authClient).toBeDefined();
      expect(typeof authClient.from).toBe("function");

      // 読み取り専用クライアント
      const readOnlyClient = factory.createReadOnlyClient();
      expect(readOnlyClient).toBeDefined();
      expect(typeof readOnlyClient.from).toBe("function");

      // ブラウザクライアント
      const browserClient = factory.createBrowserClient();
      expect(browserClient).toBeDefined();
      expect(typeof browserClient.from).toBe("function");
    });

    it("ゲストクライアントが正しいヘッダーで作成されるべき", () => {
      const factory = getSecureClientFactory();
      const validToken = "gst_" + "a".repeat(32);

      const guestClient = factory.createGuestClient(validToken);
      expect(guestClient).toBeDefined();
      expect(typeof guestClient.from).toBe("function");
    });

    it("無効なゲストトークンで適切なエラーが発生するべき", () => {
      const factory = getSecureClientFactory();
      const invalidToken = "invalid-token";

      expect(() => {
        factory.createGuestClient(invalidToken);
      }).toThrow(GuestTokenError);

      try {
        factory.createGuestClient(invalidToken);
      } catch (error) {
        expect(error).toBeInstanceOf(GuestTokenError);
        expect((error as GuestTokenError).code).toBe(GuestErrorCode.INVALID_FORMAT);
      }
    });
  });

  describe("管理者権限の検証", () => {
    it("有効な管理者理由が正しく検証されるべき", () => {
      const validReasons = Object.values(AdminReason);

      validReasons.forEach((reason) => {
        expect(Object.values(AdminReason)).toContain(reason);
      });
    });

    it("管理者理由のエナムが適切に定義されているべき", () => {
      expect(AdminReason.TEST_DATA_SETUP).toBe("test_data_setup");
      expect(AdminReason.USER_CLEANUP).toBe("user_cleanup");
      expect(AdminReason.SYSTEM_MAINTENANCE).toBe("system_maintenance");
      expect(AdminReason.EMERGENCY_ACCESS).toBe("emergency_access");
      expect(AdminReason.DATA_MIGRATION).toBe("data_migration");
      expect(AdminReason.SECURITY_INVESTIGATION).toBe("security_investigation");
    });
  });

  describe("トークンフォーマット検証", () => {
    it("様々なトークンフォーマットを正しく検証するべき", () => {
      const factory = getSecureClientFactory();

      // 有効なトークン
      const validTokens = [
        "a".repeat(32),
        "1".repeat(32),
        "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
      ];

      validTokens.forEach((token) => {
        expect(() => {
          factory.createGuestClient(token);
        }).not.toThrow();
      });

      // 無効なトークン
      const invalidTokens = [
        "", // 空文字
        "short", // 短すぎる
        "a".repeat(33), // 長すぎる
        "a".repeat(31) + "!", // 特殊文字
        "a".repeat(31) + " ", // スペース
        "a".repeat(31) + "日", // 日本語文字
      ];

      invalidTokens.forEach((token) => {
        expect(() => {
          factory.createGuestClient(token);
        }).toThrow(GuestTokenError);
      });
    });
  });

  describe("オプション設定", () => {
    it("クライアント作成オプションが正しく適用されるべき", () => {
      const factory = getSecureClientFactory();

      const options = {
        persistSession: false,
        autoRefreshToken: false,
        headers: { "X-Test-Header": "test-value" },
      };

      // 各種クライアントでオプションが適用されることを確認
      expect(() => {
        factory.createAuthenticatedClient(options);
      }).not.toThrow();

      expect(() => {
        factory.createReadOnlyClient(options);
      }).not.toThrow();

      expect(() => {
        factory.createBrowserClient(options);
      }).not.toThrow();

      expect(() => {
        factory.createGuestClient("a".repeat(32), options);
      }).not.toThrow();
    });
  });

  describe("エラーハンドリング", () => {
    it("環境変数が不足している場合の適切なエラーハンドリング", () => {
      // 環境変数をクリア
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => {
        // 新しいインスタンスを作成しようとする
        const SecureSupabaseClientFactory =
          require("@/lib/security/secure-client-factory.impl").SecureSupabaseClientFactory;
        new SecureSupabaseClientFactory();
      }).toThrow("Supabase environment variables are not configured");

      // 環境変数を復元
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    });
  });
});
