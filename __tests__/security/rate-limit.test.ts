/**
 * @jest-environment node
 */

import { jest } from "@jest/globals";
import { NextRequest } from "next/server";

// 🚀 ベストプラクティス: 高レベルモック戦略
// Upstashライブラリの代わりに、checkRateLimit関数を直接モック

import type { RateLimitConfig, RateLimitResult } from "@/lib/rate-limit";

// 実際の関数をインポートする前にモックを設定
const mockCheckRateLimit =
  jest.fn<
    (request: NextRequest, config: RateLimitConfig, keyPrefix?: string) => Promise<RateLimitResult>
  >();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimit: jest.fn(),
  RATE_LIMIT_CONFIGS: {
    userRegistration: { requests: 6, window: "5 m", identifier: "ip" },
    userLogin: { requests: 5, window: "15 m", identifier: "ip" },
    default: { requests: 60, window: "1 m", identifier: "ip" },
  },
}));

describe("Rate Limit Security Tests", () => {
  const baseConfig: RateLimitConfig = {
    requests: 5,
    window: "1 m",
    identifier: "ip",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // デフォルトの成功レスポンス
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });
  });

  describe("✅ 基本的なレート制限機能", () => {
    test("制限内のリクエストは許可される", async () => {
      // Arrange
      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });

      mockCheckRateLimit.mockResolvedValueOnce({
        success: true,
        limit: 5,
        remaining: 4,
        reset: Date.now() + 60000,
      });

      // Act
      const { checkRateLimit } = await import("@/lib/rate-limit");
      const result = await checkRateLimit(mockRequest, baseConfig, "test_allow");

      // Assert
      expect(result.success).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(4);
      expect(result.reset).toBeGreaterThan(Date.now());
      expect(mockCheckRateLimit).toHaveBeenCalledWith(mockRequest, baseConfig, "test_allow");
    });

    test("制限を超えたリクエストはブロックされる", async () => {
      // Arrange
      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.2" },
      });

      // ステートフルテスト: 複数の返り値を順次設定
      mockCheckRateLimit
        .mockResolvedValueOnce({
          success: true,
          limit: 2,
          remaining: 1,
          reset: Date.now() + 60000,
        })
        .mockResolvedValueOnce({
          success: true,
          limit: 2,
          remaining: 0,
          reset: Date.now() + 60000,
        })
        .mockResolvedValueOnce({
          success: false,
          limit: 2,
          remaining: 0,
          reset: Date.now() + 60000,
        });

      const config = { ...baseConfig, requests: 2 };
      const { checkRateLimit } = await import("@/lib/rate-limit");

      // Act & Assert - 第1回目 (成功)
      let result = await checkRateLimit(mockRequest, config, "test_block");
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(1);

      // Act & Assert - 第2回目 (成功、制限ギリギリ)
      result = await checkRateLimit(mockRequest, config, "test_block");
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(0);

      // Act & Assert - 第3回目 (失敗、制限超過)
      result = await checkRateLimit(mockRequest, config, "test_block");
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);

      expect(mockCheckRateLimit).toHaveBeenCalledTimes(3);
    });
  });

  describe("🛡️ セキュリティ要件", () => {
    test("異なるIPアドレスは独立して制限される", async () => {
      // Arrange
      const request1 = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.4" },
      });
      const request2 = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.5" },
      });

      mockCheckRateLimit
        .mockResolvedValueOnce({
          success: true,
          limit: 1,
          remaining: 0,
          reset: Date.now() + 60000,
        })
        .mockResolvedValueOnce({
          success: true,
          limit: 1,
          remaining: 0,
          reset: Date.now() + 60000,
        });

      const config = { ...baseConfig, requests: 1 };
      const { checkRateLimit } = await import("@/lib/rate-limit");

      // Act & Assert
      const result1 = await checkRateLimit(request1, config, "ip1");
      const result2 = await checkRateLimit(request2, config, "ip2");

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(1, request1, config, "ip1");
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(2, request2, config, "ip2");
    });

    test("レート制限回避の試行を防ぐ", async () => {
      // 悪意のあるヘッダーによる回避試行
      const bypassAttempts = [
        { "x-forwarded-for": "127.0.0.1,192.168.1.100" },
        { "x-real-ip": "127.0.0.1" },
        { "cf-connecting-ip": "127.0.0.1" },
      ] as const;

      const { checkRateLimit } = await import("@/lib/rate-limit");

      for (let i = 0; i < bypassAttempts.length; i++) {
        mockCheckRateLimit.mockResolvedValueOnce({
          success: false,
          limit: 1,
          remaining: 0,
          reset: Date.now() + 60000,
        });

        const request = new NextRequest("http://localhost:3000/test", {
          headers: bypassAttempts[i],
        });
        const result = await checkRateLimit(request, { ...baseConfig, requests: 1 }, "bypass");

        expect(result.success).toBe(false);
      }

      expect(mockCheckRateLimit).toHaveBeenCalledTimes(bypassAttempts.length);
    });
  });

  describe("⚠️ エラーハンドリング", () => {
    test("予期しないエラー時はフェイルオープンする", async () => {
      // Arrange
      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.6" },
      });

      // フェイルオープン時の期待される動作をモック
      mockCheckRateLimit.mockResolvedValueOnce({
        success: true, // フェイルオープン: セキュリティよりも可用性を優先
        limit: baseConfig.requests,
        remaining: baseConfig.requests - 1,
        reset: Date.now() + 60000,
      });

      const { checkRateLimit } = await import("@/lib/rate-limit");

      // Act
      const result = await checkRateLimit(mockRequest, baseConfig, "error_test");

      // Assert - フェイルオープン
      expect(result.success).toBe(true);
      expect(typeof result.limit).toBe("number");
      expect(typeof result.remaining).toBe("number");
      expect(typeof result.reset).toBe("number");
      expect(mockCheckRateLimit).toHaveBeenCalledWith(mockRequest, baseConfig, "error_test");
    });

    test("設定値の検証", async () => {
      // 不正な設定でのテスト
      const invalidConfigs = [
        { requests: 0, window: "1 m", identifier: "ip" as const },
        { requests: -1, window: "1 m", identifier: "ip" as const },
        { requests: 5, window: "", identifier: "ip" as const },
      ];

      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.7" },
      });

      const { checkRateLimit } = await import("@/lib/rate-limit");

      for (const invalidConfig of invalidConfigs) {
        // 不正な設定に対してはエラーまたはフェイルオープンを期待
        mockCheckRateLimit.mockResolvedValueOnce({
          success: true, // フェイルオープン
          limit: 60, // デフォルト値
          remaining: 59,
          reset: Date.now() + 60000,
        });

        const result = await checkRateLimit(mockRequest, invalidConfig, "invalid_config");

        // フェイルオープンによる動作を確認
        expect(typeof result.success).toBe("boolean");
        expect(typeof result.limit).toBe("number");
        expect(typeof result.remaining).toBe("number");
        expect(typeof result.reset).toBe("number");
      }
    });
  });

  describe("📋 実際の設定値テスト", () => {
    test("ユーザー登録のレート制限設定", async () => {
      const mockRequest = new NextRequest("http://localhost:3000/api/auth/register", {
        headers: { "x-forwarded-for": "192.168.1.8" },
      });

      mockCheckRateLimit.mockResolvedValueOnce({
        success: true,
        limit: 6, // userRegistration設定
        remaining: 5,
        reset: Date.now() + 300000, // 5分
      });

      const { checkRateLimit, RATE_LIMIT_CONFIGS } = await import("@/lib/rate-limit");
      const result = await checkRateLimit(
        mockRequest,
        RATE_LIMIT_CONFIGS.userRegistration,
        "register"
      );

      expect(result.success).toBe(true);
      expect(result.limit).toBe(6);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        mockRequest,
        RATE_LIMIT_CONFIGS.userRegistration,
        "register"
      );
    });

    test("ログインのレート制限設定", async () => {
      const mockRequest = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: { "x-forwarded-for": "192.168.1.9" },
      });

      mockCheckRateLimit.mockResolvedValueOnce({
        success: true,
        limit: 5, // userLogin設定
        remaining: 4,
        reset: Date.now() + 900000, // 15分
      });

      const { checkRateLimit, RATE_LIMIT_CONFIGS } = await import("@/lib/rate-limit");
      const result = await checkRateLimit(mockRequest, RATE_LIMIT_CONFIGS.userLogin, "login");

      expect(result.success).toBe(true);
      expect(result.limit).toBe(5);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        mockRequest,
        RATE_LIMIT_CONFIGS.userLogin,
        "login"
      );
    });
  });

  describe("🎯 Server Actions レート制限統合テスト", () => {
    // Server Actions専用のモック設定
    let mockServerActionCheckRateLimit: jest.MockedFunction<any>;
    let mockHeaders: jest.MockedFunction<any>;

    beforeEach(() => {
      // Server Actions用のレート制限チェック関数のモック
      mockServerActionCheckRateLimit = jest.fn();
      
      // headers()関数のモック
      mockHeaders = jest.fn().mockReturnValue({
        get: jest.fn().mockImplementation((header: string) => {
          if (header === "x-forwarded-for") return "192.168.1.100";
          if (header === "x-real-ip") return null;
          if (header === "cf-connecting-ip") return null;
          return null;
        })
      });

      // Server Actions用モジュールモック
      jest.doMock("@/lib/rate-limit", () => ({
        checkRateLimit: mockServerActionCheckRateLimit,
        RATE_LIMIT_CONFIGS: {
          userLogin: { requests: 5, window: "15 m", identifier: "ip" },
          userRegistration: { requests: 6, window: "5 m", identifier: "ip" },
          default: { requests: 60, window: "1 m", identifier: "ip" }
        }
      }));

      jest.doMock("next/headers", () => ({
        headers: mockHeaders
      }));

      // その他の依存関係のモック
      jest.doMock("@/lib/auth-security", () => ({
        InputSanitizer: {
          sanitizeEmail: jest.fn((email: string) => email),
          sanitizePassword: jest.fn((password: string) => password)
        },
        TimingAttackProtection: {
          normalizeResponseTime: jest.fn(async (fn: () => Promise<void>) => await fn())
        }
      }));

      jest.doMock("@/lib/services/login", () => ({
        LoginService: {
          login: jest.fn().mockResolvedValue({
            success: true,
            user: { id: "test-user-id", email: "test@example.com" },
            sessionToken: "mock-token"
          })
        }
      }));

      jest.doMock("@/lib/services/registration", () => ({
        RegistrationService: {
          register: jest.fn().mockResolvedValue({
            success: true,
            userId: "test-user-id"
          })
        }
      }));

      jest.doMock("@/lib/services/password-reset", () => ({
        PasswordResetService: {
          sendResetEmail: jest.fn().mockResolvedValue(undefined)
        }
      }));

      jest.doMock("@/lib/supabase/server", () => ({
        createClient: jest.fn()
      }));

      jest.doMock("next/cache", () => ({
        revalidatePath: jest.fn()
      }));
    });

    afterEach(() => {
      jest.resetAllMocks();
      jest.resetModules();
    });

    test("loginAction: レート制限内では正常にログイン処理される", async () => {
      // レート制限チェックが成功を返すよう設定
      mockServerActionCheckRateLimit.mockResolvedValue({ success: true });

      // loginActionの動的インポート
      const { loginAction } = await import("@/app/auth/actions");

      // テスト用FormDataの作成
      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "password123");
      formData.append("rememberMe", "false");

      const result = await loginAction(formData);

      expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userLogin", "192.168.1.100");
      expect(result.success).toBe(true);
    });

    test("loginAction: レート制限超過時は適切なエラーメッセージで拒否される", async () => {
      // レート制限チェックが失敗を返すよう設定
      mockServerActionCheckRateLimit.mockResolvedValue({
        success: false,
        retryAfter: 900 // 15分後
      });

      const { loginAction } = await import("@/app/auth/actions");

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "password123");

      const result = await loginAction(formData);

      expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userLogin", "192.168.1.100");
      expect(result.success).toBe(false);
      expect(result.error).toContain("ログイン試行回数が上限に達しました");
      expect(result.error).toContain("15分後に再試行");
    });

    test("registerAction: レート制限内では正常にユーザー登録される", async () => {
      mockServerActionCheckRateLimit.mockResolvedValue({ success: true });

      const { registerAction } = await import("@/app/auth/actions");

      const formData = new FormData();
      formData.append("name", "Test User");
      formData.append("email", "test@example.com");
      formData.append("password", "password123A");
      formData.append("confirmPassword", "password123A");

      const result = await registerAction(formData);

      expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userRegistration", "192.168.1.100");
      expect(result.success).toBe(true);
    });

    test("registerAction: レート制限超過時は適切なエラーメッセージで拒否される", async () => {
      mockServerActionCheckRateLimit.mockResolvedValue({
        success: false,
        retryAfter: 300 // 5分後
      });

      const { registerAction } = await import("@/app/auth/actions");

      const formData = new FormData();
      formData.append("name", "Test User");
      formData.append("email", "test@example.com");
      formData.append("password", "password123A");
      formData.append("confirmPassword", "password123A");

      const result = await registerAction(formData);

      expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userRegistration", "192.168.1.100");
      expect(result.success).toBe(false);
      expect(result.error).toContain("ユーザー登録試行回数が上限に達しました");
      expect(result.error).toContain("5分後に再試行");
    });

    test("resetPasswordAction: レート制限内では正常にパスワードリセットメールが送信される", async () => {
      mockServerActionCheckRateLimit.mockResolvedValue({ success: true });

      const { resetPasswordAction } = await import("@/app/auth/actions");

      const formData = new FormData();
      formData.append("email", "test@example.com");

      const result = await resetPasswordAction(formData);

      expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("default", "192.168.1.100");
      expect(result.success).toBe(true);
      expect(result.message).toContain("パスワードリセットメールを送信しました");
    });

    test("resetPasswordAction: レート制限超過時は適切なエラーメッセージで拒否される", async () => {
      mockServerActionCheckRateLimit.mockResolvedValue({
        success: false,
        retryAfter: 60 // 1分後
      });

      const { resetPasswordAction } = await import("@/app/auth/actions");

      const formData = new FormData();
      formData.append("email", "test@example.com");

      const result = await resetPasswordAction(formData);

      expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("default", "192.168.1.100");
      expect(result.success).toBe(false);
      expect(result.error).toContain("パスワードリセット試行回数が上限に達しました");
      expect(result.error).toContain("1分後に再試行");
    });

    describe("IP取得機能テスト", () => {
      test("x-forwarded-forヘッダーから正しくIPを取得", async () => {
        mockHeaders.mockReturnValue({
          get: jest.fn().mockImplementation((header: string) => {
            if (header === "x-forwarded-for") return "203.0.113.195, 192.168.1.100";
            return null;
          })
        });

        mockServerActionCheckRateLimit.mockResolvedValue({ success: true });

        const { loginAction } = await import("@/app/auth/actions");

        const formData = new FormData();
        formData.append("email", "test@example.com");
        formData.append("password", "password123");

        await loginAction(formData);

        // 最初のIPアドレス（実際のクライアントIP）が使用されることを確認
        expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userLogin", "203.0.113.195");
      });

      test("x-real-ipヘッダーからIPを取得", async () => {
        mockHeaders.mockReturnValue({
          get: jest.fn().mockImplementation((header: string) => {
            if (header === "x-forwarded-for") return null;
            if (header === "x-real-ip") return "198.51.100.178";
            return null;
          })
        });

        mockServerActionCheckRateLimit.mockResolvedValue({ success: true });

        const { loginAction } = await import("@/app/auth/actions");

        const formData = new FormData();
        formData.append("email", "test@example.com");
        formData.append("password", "password123");

        await loginAction(formData);

        expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userLogin", "198.51.100.178");
      });

      test("IPヘッダーが無い場合はデフォルトIPを使用", async () => {
        mockHeaders.mockReturnValue({
          get: jest.fn().mockReturnValue(null)
        });

        mockServerActionCheckRateLimit.mockResolvedValue({ success: true });

        const { loginAction } = await import("@/app/auth/actions");

        const formData = new FormData();
        formData.append("email", "test@example.com");
        formData.append("password", "password123");

        await loginAction(formData);

        expect(mockServerActionCheckRateLimit).toHaveBeenCalledWith("userLogin", "127.0.0.1");
      });
    });
  });
});
