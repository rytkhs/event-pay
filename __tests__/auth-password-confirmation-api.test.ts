/**
 * @jest-environment node
 */

/**
 * パスワード確認フィールド機能のAPIテスト
 * TDD Red Phase: テスト先行作成
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registrationSchema } from "@/lib/services/registration";

type RegisterWithConfirmInput = z.infer<typeof registrationSchema>;

// モックレジスターハンドラー（パスワード確認機能付き）
const createMockRegisterWithConfirmHandler = () => {
  return async (request: NextRequest) => {
    try {
      const body = await request.json();

      // バリデーション実行
      const validation = registrationSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "バリデーションエラー",
            details: validation.error.flatten().fieldErrors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const { name, email, password, confirmPassword } = validation.data;

      // 成功レスポンス
      return new Response(
        JSON.stringify({
          success: true,
          message: "ユーザー登録が完了しました。メールアドレスに確認メールを送信しました。",
          requiresEmailConfirmation: true,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, error: "サーバーエラーが発生しました" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  };
};

// テストヘルパー
const createTestRequest = (
  method: string = "POST",
  body?: any,
  headers: { [key: string]: string } = {}
) => {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
};

describe("パスワード確認フィールド機能テスト - Red Phase", () => {
  let mockHandler: (request: NextRequest) => Promise<Response>;

  beforeEach(() => {
    mockHandler = createMockRegisterWithConfirmHandler();
  });

  describe("パスワード確認バリデーション", () => {
    test("confirmPasswordフィールドが必須になる", async () => {
      const incompleteData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "SecurePass123!",
        // confirmPassword が欠損
      };

      const request = createTestRequest("POST", incompleteData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.confirmPassword).toBeDefined();
    });

    test("パスワードと確認パスワードが一致しない場合エラーになる", async () => {
      const mismatchData: RegisterWithConfirmInput = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "SecurePass123!",
        confirmPassword: "DifferentPass456!",
      };

      const request = createTestRequest("POST", mismatchData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.confirmPassword).toContain(
        "パスワードと確認用パスワードが一致しません"
      );
    });

    test("パスワードと確認パスワードが一致する場合は成功する", async () => {
      const validData: RegisterWithConfirmInput = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
      };

      const request = createTestRequest("POST", validData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
      expect(result.message).toContain("ユーザー登録が完了しました");
    });

    test("確認パスワードが空文字列の場合エラーになる", async () => {
      const emptyConfirmData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "SecurePass123!",
        confirmPassword: "",
      };

      const request = createTestRequest("POST", emptyConfirmData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.confirmPassword).toContain(
        "パスワードと確認用パスワードが一致しません"
      );
    });
  });

  describe("セキュリティテスト", () => {
    test("確認パスワードにスクリプトが含まれていても適切に処理される", async () => {
      const xssData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "SecurePass123!",
        confirmPassword: '<script>alert("xss")</script>',
      };

      const request = createTestRequest("POST", xssData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.confirmPassword).toContain(
        "パスワードと確認用パスワードが一致しません"
      );
    });

    test("確認パスワードに非常に長い文字列が含まれていても適切に処理される", async () => {
      const longPassword = "a".repeat(200);
      const longConfirmData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: longPassword,
        confirmPassword: longPassword,
      };

      const request = createTestRequest("POST", longConfirmData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      // パスワードが128文字制限を超えているためエラー
      expect(result.details.password).toContain("パスワードは128文字以内で入力してください");
    });

    test("確認パスワードにSQLインジェクションが含まれていても安全に処理される", async () => {
      const sqlInjectionPassword = "'; DROP TABLE users; --";
      const sqlInjectionData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "SecurePass123!",
        confirmPassword: sqlInjectionPassword,
      };

      const request = createTestRequest("POST", sqlInjectionData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.confirmPassword).toContain(
        "パスワードと確認用パスワードが一致しません"
      );
    });
  });

  describe("バリデーション詳細テスト", () => {
    test("パスワードが弱い場合、確認パスワードが一致してもエラーになる", async () => {
      const weakPasswordData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "123", // 弱いパスワード
        confirmPassword: "123",
      };

      const request = createTestRequest("POST", weakPasswordData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.password).toContain("パスワードは8文字以上で入力してください");
    });

    test("パスワードが英数字を含まない場合、確認パスワードが一致してもエラーになる", async () => {
      const noAlphanumericData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "onlyletters", // 数字なし
        confirmPassword: "onlyletters",
      };

      const request = createTestRequest("POST", noAlphanumericData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.password).toContain("パスワードは英数字を含む必要があります");
    });

    test("複数のバリデーションエラーが同時に発生する場合", async () => {
      const multipleErrorsData = {
        name: "", // 空の名前
        email: "invalid-email", // 無効なメール
        password: "123", // 弱いパスワード
        confirmPassword: "456", // 不一致の確認パスワード
      };

      const request = createTestRequest("POST", multipleErrorsData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.details.name).toBeDefined();
      expect(result.details.email).toBeDefined();
      expect(result.details.password).toBeDefined();
      expect(result.details.confirmPassword).toBeDefined();
    });
  });

  describe("エッジケースのテスト", () => {
    test("確認パスワードにUnicode文字が含まれている場合", async () => {
      const unicodePassword = "パスワード123!";
      const unicodeData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: unicodePassword,
        confirmPassword: unicodePassword,
      };

      const request = createTestRequest("POST", unicodeData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
    });

    test("確認パスワードに特殊文字が含まれている場合", async () => {
      const specialCharPassword = "Secure@Pass#123!";
      const specialCharData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: specialCharPassword,
        confirmPassword: specialCharPassword,
      };

      const request = createTestRequest("POST", specialCharData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
    });

    test("確認パスワードに空白文字が含まれている場合", async () => {
      const whitespacePassword = "Secure Pass 123!";
      const whitespaceData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: whitespacePassword,
        confirmPassword: whitespacePassword,
      };

      const request = createTestRequest("POST", whitespaceData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.success).toBe(true);
    });
  });
});
