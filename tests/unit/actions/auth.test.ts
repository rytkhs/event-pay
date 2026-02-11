/**
 * 認証関連Server Actionのユニットテスト
 */

import { jest } from "@jest/globals";

import { expectActionFailure } from "@tests/helpers/assert-result";

import { loginAction } from "@/app/(auth)/actions";

import { setupNextHeadersMocks } from "../../setup/common-mocks";
import { createMockSupabaseClient } from "../../setup/supabase-auth-mock";

// Next.js headers モック（共通関数を使用するため、モック化のみ宣言）
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

// Supabase client をモック化（共通モックを使用）
const mockSupabase = createMockSupabaseClient();

jest.mock("../../../core/supabase/server", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// auth-securityモジュールをモック化
jest.mock("../../../core/auth-security", () => ({
  TimingAttackProtection: {
    addConstantDelay: jest.fn(async (_baseDelayMs?: number) => {
      // モックでは何もしない
    }),
    normalizeResponseTime: jest.fn(async <T>(fn: () => Promise<T>): Promise<T> => {
      return await fn();
    }),
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
  // ヘッダーをセットアップするヘルパー関数（共通関数を使用）
  const setupHeaders = (headers: Record<string, string>) => {
    const mockHeaders = setupNextHeadersMocks(headers);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { headers: headersFn } = require("next/headers");
    (headersFn as jest.MockedFunction<typeof headersFn>).mockReturnValue(mockHeaders as any);
  };

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
      const error = expectActionFailure(result);
      // バリデーションエラー時は汎用的なエラーメッセージが返される
      expect(error.userMessage).toBe("入力内容を確認してください");
      // 詳細なエラーはfieldErrorsに含まれる
      expect(error.fieldErrors?.email?.[0]).toContain("有効なメールアドレス");
    });

    it("パスワードが空の場合は拒否される", async () => {
      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", ""); // 空のパスワード

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      const error = expectActionFailure(result);
      // バリデーションエラー時は汎用的なエラーメッセージが返される
      expect(error.userMessage).toBe("入力内容を確認してください");
      // 詳細なエラーはfieldErrorsに含まれる
      expect(error.fieldErrors?.password?.[0]).toBe("パスワードを入力してください");
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
      (mockSupabase.auth.signInWithPassword as jest.MockedFunction<any>).mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      });

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "wrongpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      const error = expectActionFailure(result);
      // ユーザー列挙攻撃対策により、統一されたエラーメッセージが返される
      expect(error.userMessage).toBe("メールアドレスまたはパスワードが正しくありません");
    });

    it("メール未確認エラーは適切に処理される", async () => {
      (mockSupabase.auth.signInWithPassword as jest.MockedFunction<any>).mockResolvedValue({
        data: { user: null },
        error: {
          message: "Email not confirmed",
          name: "AuthApiError",
          status: 400,
          code: "email_not_confirmed",
          __isAuthError: true,
        },
      });

      const formData = new FormData();
      formData.append("email", "unconfirmed@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.needsVerification).toBe(true);
      }
      const error = expectActionFailure(result);
      expect(error.code).toBe("LOGIN_FAILED");
      expect(error.userMessage).toBe("メールアドレスの確認が必要です。");
    });

    it("Supabaseの予期しないエラーは適切に処理される", async () => {
      (mockSupabase.auth.signInWithPassword as jest.MockedFunction<any>).mockRejectedValue(
        new Error("Network error")
      );

      const formData = new FormData();
      formData.append("email", "test@example.com");
      formData.append("password", "validpassword");

      const result = await loginAction(formData);

      expect(result.success).toBe(false);
    });
  });
});
