/**
 * 認証関連Server Actionのユニットテスト
 */

import { jest } from "@jest/globals";

import { loginAction } from "../../../core/actions/auth";

// Next.js headers モック
let mockHeaders: { get: (name: string) => string | null } | undefined;

jest.mock("next/headers", () => ({
  headers: jest.fn(() => mockHeaders),
}));

// Supabase client をモック化
const mockSupabaseAuth = {
  signInWithPassword: jest.fn() as jest.MockedFunction<any>,
};

const mockSupabase = {
  auth: mockSupabaseAuth,
};

jest.mock("../../../core/supabase/server", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// auth-securityモジュールをモック化
jest.mock("../../../core/auth-security", () => ({
  TimingAttackProtection: {
    addConstantDelay: jest.fn(),
    normalizeResponseTime: jest.fn(),
  },
  InputSanitizer: {
    sanitizeEmail: jest.fn((email: string) => email),
    sanitizePassword: jest.fn((password: string) => password),
  },
  AccountLockoutService: {
    checkLockoutStatus: (jest.fn() as any).mockResolvedValue({
      isLocked: false,
      remainingAttempts: 10,
    }),
    recordFailedAttempt: (jest.fn() as any).mockResolvedValue({
      failedAttempts: 1,
      isLocked: false,
    }),
    clearFailedAttempts: (jest.fn() as any).mockResolvedValue(undefined),
  },
}));

describe("loginAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders = undefined;
  });

  // ヘッダーをセットアップするヘルパー関数
  const setupHeaders = (headers: Record<string, string>) => {
    mockHeaders = {
      get: (name: string) => headers[name.toLowerCase()] || null,
    };
  };

  describe("CSRF保護", () => {
    it("有効なOrigin/Refererヘッダーでリクエストが通る", async () => {
      // 有効なヘッダーでセットアップ
      setupHeaders({
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/login",
        host: "localhost:3000",
      });

      // Supabaseのレスポンスをモック
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(true);
      expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "validpassword",
      });
    });

    it("Origin/Refererヘッダーがない場合はCSRF攻撃として拒否", async () => {
      // 無効なヘッダーでセットアップ（origin、refererなし）
      setupHeaders({
        host: "localhost:3000",
        "user-agent": "test-user-agent",
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("不正なリクエストです");
      expect(mockSupabaseAuth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("悪意のあるOriginの場合はCSRF攻撃として拒否", async () => {
      // 悪意のあるヘッダーでセットアップ
      setupHeaders({
        origin: "https://evil-site.com",
        referer: "https://evil-site.com/attack",
        host: "localhost:3000",
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("CSRF攻撃を検出しました");
      expect(mockSupabaseAuth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("localhost:3000からのリクエストは許可される", async () => {
      // localhost:3000からのリクエスト
      setupHeaders({
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/login",
        host: "localhost:3000",
      });

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(true);
    });

    it("HTTPS localhostからのリクエストは許可される", async () => {
      // HTTPS localhost からのリクエスト
      setupHeaders({
        origin: "https://localhost:3000",
        referer: "https://localhost:3000/login",
        host: "localhost:3000",
      });

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "test-user-id", email: "test@example.com" } },
        error: null,
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(true);
    });
  });

  describe("入力バリデーション", () => {
    beforeEach(() => {
      // 各テストで有効なヘッダーを設定
      setupHeaders({
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/login",
        host: "localhost:3000",
      });
    });

    it("無効なメールアドレスは拒否される", async () => {
      const formData = new FormData();
      formData.append("email", "invalid-email");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("有効なメールアドレス");
    });

    it("パスワードが短すぎる場合は拒否される", async () => {
      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "123"); // 短すぎるパスワード

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("8文字以上");
    });

    it("必須フィールドが不足している場合は拒否される", async () => {
      const formData = new FormData();
      formData.append("email", "test@example.com");
      // パスワードを省略

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
    });
  });

  describe("認証エラーハンドリング", () => {
    beforeEach(() => {
      setupHeaders({
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/login",
        host: "localhost:3000",
      });
    });

    it("Supabaseの認証エラーは適切に処理される", async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "wrongpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("認証");
    });

    it("Supabaseの予期しないエラーは適切に処理される", async () => {
      mockSupabaseAuth.signInWithPassword.mockRejectedValue(new Error("Network error"));

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
    });
  });
});
