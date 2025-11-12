/**
 * お問い合わせ送信 - 統合テスト
 * Server Actionの200/409/429レスポンスを検証
 */

import { jest } from "@jest/globals";

import {
  setupCommonMocks,
  setupSupabaseClientMocks,
  type CommonMocks,
} from "@tests/setup/common-mocks";

import { submitContact } from "@/app/(public)/contact/actions";
import { ContactInputSchema } from "@/app/(public)/contact/useContactForm";

// モック化の宣言（共通関数を使用するため、モック化のみ宣言）
// Next.js headers モック
jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

// Supabase client をモック化
jest.mock("@core/supabase/server", () => ({
  createClient: jest.fn(),
}));

// レート制限のモック（POLICIESも保持）
jest.mock("@core/rate-limit", () => {
  const actual = jest.requireActual("@core/rate-limit");
  return {
    ...actual,
    enforceRateLimit: jest.fn(),
    buildKey: jest.fn(),
    POLICIES: {
      ...actual.POLICIES,
      "contact.submit": {
        scope: "contact.submit",
        limit: 5,
        window: "1 m",
        blockMs: 5 * 60 * 1000,
      },
    },
  };
});

// IP検出のモック
jest.mock("@core/utils/ip-detection", () => ({
  getClientIPFromHeaders: jest.fn(),
}));

// 環境変数のモック
jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: jest.fn(),
}));

// ロガーのモック（ログ出力を抑制）
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// メール通知のモック（非同期処理を抑制）
jest.mock("@core/notification/email-service", () => ({
  EmailNotificationService: jest.fn(),
}));

// Slack通知のモック
jest.mock("@core/notification/slack", () => ({
  sendSlackText: jest.fn(),
}));

describe("submitContact Server Action - 統合テスト", () => {
  let mocks: CommonMocks;
  let mockSupabase: ReturnType<typeof setupSupabaseClientMocks>;

  beforeAll(() => {
    // Supabase clientのモックを個別に設定（createClientのモックが必要なため）
    mockSupabase = setupSupabaseClientMocks();
    const { createClient } = require("@core/supabase/server");
    (createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any);

    // ダミーのtestUserを作成（認証は不要だが、setupCommonMocksの型要件のため）
    const dummyUser = {
      id: "dummy-user-id",
      email: "dummy@example.com",
    } as any;

    // 共通モックを設定（setupCommonMocksを使用）
    mocks = setupCommonMocks(dummyUser, {
      includeLogger: true,
      includeRateLimit: true,
      allowRateLimit: true,
      includeNextHeaders: true,
      customHeaders: { "user-agent": "test-user-agent" },
      includeSupabaseClient: false, // 個別に設定済み
      includeCloudflareEnv: true,
      customEnv: {
        RL_HMAC_SECRET: "test-secret-key",
        ADMIN_EMAIL: "admin@example.com",
        SLACK_CONTACT_WEBHOOK_URL: undefined,
      },
      includeIPDetection: true,
      ipAddress: "127.0.0.1",
      includeEmailService: true,
      emailServiceOptions: { sendEmailSuccess: true },
      includeSlack: true,
      slackSuccess: true,
    });

    // Supabase clientを個別に設定（setupCommonMocksではcreateClientのモックができないため）
    mocks.mockSupabaseClient = mockSupabase;

    // レート制限のbuildKeyを設定（setupCommonMocksではカスタムキーが設定できないため）
    if (mocks.mockBuildKey) {
      mocks.mockBuildKey.mockReturnValue("RL:contact.submit:127.0.0.1");
    }
  });

  // モックのリセット
  beforeEach(() => {
    // Next.js headersのモックを設定
    const { headers } = require("next/headers");
    (headers as jest.MockedFunction<typeof headers>).mockReturnValue(mocks.mockHeaders as any);

    // レート制限のモックをリセット
    mocks.mockEnforceRateLimit!.mockResolvedValue({ allowed: true });
    mocks.mockBuildKey!.mockReturnValue("RL:contact.submit:127.0.0.1");

    // Supabaseのinsertをリセット
    (mockSupabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("正常系 (200)", () => {
    test("有効な入力で送信が成功する", async () => {
      // Arrange
      const validInput = {
        name: "山田 太郎",
        email: "test@example.com",
        message: "これはテストのお問い合わせ内容です。10文字以上の内容を記載しています。",
        consent: true,
      };

      // Act
      const result = await submitContact(validInput);

      // Assert
      expect(result).toEqual({
        success: true,
        data: { ok: true },
      });
    });

    test("サニタイズ処理が正しく適用される", async () => {
      // Arrange
      const inputWithHtml = {
        name: "<script>alert('XSS')</script>山田 太郎",
        email: "test@example.com",
        message: "<p>HTMLタグを含むメッセージです</p>これはテストのお問い合わせ内容です。",
        consent: true,
      };

      let insertedData: any = null;
      (mockSupabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockImplementation((data) => {
          insertedData = data;
          return Promise.resolve({ data: null, error: null });
        }),
      });

      // Act
      const result = await submitContact(inputWithHtml);

      // Assert
      expect(result).toEqual({
        success: true,
        data: { ok: true },
      });
      // DBに保存されたデータにHTMLタグが含まれていないことを確認
      expect(insertedData).toBeTruthy();
      expect(insertedData.name).not.toContain("<script>");
      expect(insertedData.name).not.toContain("alert");
      expect(insertedData.message).not.toContain("<p>");
      expect(insertedData.message).not.toContain("</p>");
      // サニタイズ後も内容は保持される
      expect(insertedData.name).toContain("山田 太郎");
      expect(insertedData.message).toContain("これはテストのお問い合わせ内容です。");
    });
  });

  describe("バリデーションエラー (422)", () => {
    test("氏名が空の場合エラーを返す", async () => {
      // Arrange
      const invalidInput = {
        name: "",
        email: "test@example.com",
        message: "これはテストのお問い合わせ内容です。",
        consent: true,
      };

      // Act
      const result = await submitContact(invalidInput);

      // Assert
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("メールアドレスが不正な場合エラーを返す", async () => {
      // Arrange
      const invalidInput = {
        name: "山田 太郎",
        email: "invalid-email",
        message: "これはテストのお問い合わせ内容です。",
        consent: true,
      };

      // Act
      const result = await submitContact(invalidInput);

      // Assert
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("メッセージが10文字未満の場合エラーを返す", async () => {
      // Arrange
      const invalidInput = {
        name: "山田 太郎",
        email: "test@example.com",
        message: "短い",
        consent: true,
      };

      // Act
      const result = await submitContact(invalidInput);

      // Assert
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("code", "VALIDATION_ERROR");
    });

    test("consentがfalseの場合エラーを返す", async () => {
      // Arrange
      const invalidInput = {
        name: "山田 太郎",
        email: "test@example.com",
        message: "これはテストのお問い合わせ内容です。",
        consent: false,
      };

      // Act
      const result = await submitContact(invalidInput);

      // Assert
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("code", "VALIDATION_ERROR");
    });
  });

  describe("重複送信エラー (409)", () => {
    test("同日・同内容の重複送信をブロックする", async () => {
      // Arrange
      const input = {
        name: "山田 太郎",
        email: "test@example.com",
        message: "重複テスト用のメッセージです。これは10文字以上の内容です。",
        consent: true,
      };

      let callCount = 0;
      (mockSupabase.from as jest.Mock).mockReturnValue({
        insert: jest.fn().mockImplementation(() => {
          callCount++;
          // 1回目は成功、2回目は重複エラー（23505）
          if (callCount === 1) {
            return Promise.resolve({ data: null, error: null });
          } else {
            return Promise.resolve({
              data: null,
              error: {
                code: "23505",
                message: "duplicate key value violates unique constraint",
              },
            });
          }
        }),
      });

      // Act - 1回目の送信
      const result1 = await submitContact(input);
      // Act - 2回目の送信（同じ内容）
      const result2 = await submitContact(input);

      // Assert
      expect(result1).toEqual({
        success: true,
        data: { ok: true },
      });
      expect(result2).toHaveProperty("success", false);
      expect(result2).toHaveProperty("code", "RESOURCE_CONFLICT");
      expect(result2).toHaveProperty("error", expect.stringContaining("同一内容の短時間での再送"));
    });
  });

  describe("レート制限エラー (429)", () => {
    test("短時間に複数回送信するとレート制限される", async () => {
      // Arrange
      const baseInput = {
        name: "山田 太郎",
        email: "test@example.com",
        consent: true,
      };

      let callCount = 0;
      mocks.mockEnforceRateLimit!.mockImplementation(() => {
        callCount++;
        // 5回目までは許可、6回目はレート制限
        if (callCount <= 5) {
          return Promise.resolve({ allowed: true });
        } else {
          return Promise.resolve({
            allowed: false,
            retryAfter: 60, // 60秒
          });
        }
      });

      // Act - 6回連続送信（制限は5回/分）
      const results = [];
      for (let i = 0; i < 6; i++) {
        const input = {
          ...baseInput,
          message: `レート制限テスト ${i + 1}回目の送信です。これは10文字以上の内容です。`,
        };
        results.push(await submitContact(input));
      }

      // Assert - 6回目はレート制限される
      const lastResult = results[results.length - 1];
      expect(lastResult).toHaveProperty("success", false);
      expect(lastResult).toHaveProperty("code", "RATE_LIMITED");
      expect(lastResult).toHaveProperty("details");
      expect((lastResult as any).details).toHaveProperty("retryAfterSec", 60);
      // 1-5回目は成功
      for (let i = 0; i < 5; i++) {
        expect(results[i]).toEqual({
          success: true,
          data: { ok: true },
        });
      }
    });
  });

  describe("Zodスキーマのバリデーション", () => {
    test("スキーマは想定通りの構造を持つ", () => {
      // Arrange & Act
      const shape = ContactInputSchema.shape;

      // Assert
      expect(shape).toHaveProperty("name");
      expect(shape).toHaveProperty("email");
      expect(shape).toHaveProperty("message");
      expect(shape).toHaveProperty("consent");
    });

    test("スキーマは正しい値を受け入れる", () => {
      // Arrange
      const validData = {
        name: "山田 太郎",
        email: "test@example.com",
        message: "これはテストのお問い合わせ内容です。",
        consent: true,
      };

      // Act
      const result = ContactInputSchema.safeParse(validData);

      // Assert
      expect(result.success).toBe(true);
    });

    test("スキーマは不正な値を拒否する", () => {
      // Arrange
      const invalidData = {
        name: "",
        email: "not-an-email",
        message: "短い",
        consent: false,
      };

      // Act
      const result = ContactInputSchema.safeParse(invalidData);

      // Assert
      expect(result.success).toBe(false);
    });
  });
});
