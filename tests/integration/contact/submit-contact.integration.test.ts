/**
 * お問い合わせ送信 - 統合テスト
 * Server Actionの200/409/429レスポンスを検証
 */

import { submitContact } from "@/app/(public)/contact/actions";
import { ContactInputSchema } from "@/app/(public)/contact/useContactForm";

describe("submitContact Server Action - 統合テスト", () => {
  // TODO: Supabaseクライアントとレート制限のモック設定
  // TODO: 環境変数のモック設定

  describe("正常系 (200)", () => {
    test.skip("有効な入力で送信が成功する", async () => {
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
      expect(result).toEqual({ ok: true });
    });

    test.skip("サニタイズ処理が正しく適用される", async () => {
      // Arrange
      const inputWithHtml = {
        name: "<script>alert('XSS')</script>山田 太郎",
        email: "test@example.com",
        message: "<p>HTMLタグを含むメッセージです</p>これはテストのお問い合わせ内容です。",
        consent: true,
      };

      // Act
      const result = await submitContact(inputWithHtml);

      // Assert
      expect(result).toEqual({ ok: true });
      // TODO: DBに保存されたデータにHTMLタグが含まれていないことを確認
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
    test.skip("同日・同内容の重複送信をブロックする", async () => {
      // Arrange
      const input = {
        name: "山田 太郎",
        email: "test@example.com",
        message: "重複テスト用のメッセージです。これは10文字以上の内容です。",
        consent: true,
      };

      // Act - 1回目の送信
      const result1 = await submitContact(input);
      // Act - 2回目の送信（同じ内容）
      const result2 = await submitContact(input);

      // Assert
      expect(result1).toEqual({ ok: true });
      expect(result2).toHaveProperty("status", 409);
      expect(result2).toHaveProperty("code", "RESOURCE_CONFLICT");
      expect(result2).toHaveProperty("detail", expect.stringContaining("同一内容の短時間での再送"));
    });
  });

  describe("レート制限エラー (429)", () => {
    test.skip("短時間に複数回送信するとレート制限される", async () => {
      // Arrange
      const baseInput = {
        name: "山田 太郎",
        email: "test@example.com",
        consent: true,
      };

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
      expect(lastResult).toHaveProperty("status", 429);
      expect(lastResult).toHaveProperty("code", "RATE_LIMITED");
      expect(lastResult).toHaveProperty("retryAfterSec");
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
