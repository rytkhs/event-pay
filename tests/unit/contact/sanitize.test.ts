/**
 * お問い合わせ機能 - サニタイズ処理のテスト
 */

import { sanitizeForEventPay } from "@core/utils/sanitize";

describe("sanitizeForEventPay - お問い合わせ用", () => {
  test("HTMLタグを除去してテキストのみを残す", () => {
    // Arrange
    const input = "<script>alert('XSS')</script>安全なテキスト";

    // Act
    const result = sanitizeForEventPay(input);

    // Assert
    expect(result).toBe("安全なテキスト");
    expect(result).not.toContain("<script>");
  });

  test("複数のHTMLタグを除去する", () => {
    // Arrange
    const input = "<p>こんにちは</p><b>太字</b><a href='test'>リンク</a>";

    // Act
    const result = sanitizeForEventPay(input);

    // Assert
    expect(result).toBe("こんにちは太字リンク");
  });

  test("XSSペイロードを無害化する", () => {
    // Arrange
    const xssPayloads = [
      "<img src=x onerror=alert('XSS')>",
      "<svg onload=alert('XSS')>",
      "javascript:alert('XSS')",
      "<iframe src='javascript:alert(1)'>",
    ];

    xssPayloads.forEach((payload) => {
      // Act
      const result = sanitizeForEventPay(payload);

      // Assert
      expect(result).not.toContain("javascript:");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("onload");
      expect(result).not.toContain("<script");
      expect(result).not.toContain("<iframe");
    });
  });

  test("通常のテキストはそのまま保持される", () => {
    // Arrange
    const input = "これは普通のテキストです。\n改行も含まれます。";

    // Act
    const result = sanitizeForEventPay(input);

    // Assert
    expect(result).toBe(input);
  });

  test("null/undefined入力を安全に処理する", () => {
    // Arrange & Act & Assert
    expect(sanitizeForEventPay(null)).toBe("");
    expect(sanitizeForEventPay(undefined)).toBe("");
  });

  test("空文字列を安全に処理する", () => {
    // Arrange
    const input = "";

    // Act
    const result = sanitizeForEventPay(input);

    // Assert
    expect(result).toBe("");
  });

  test("特殊文字（引用符、アポストロフィなど）は保持される", () => {
    // Arrange
    const input = "これは「引用」です。'アポストロフィ'も含みます。";

    // Act
    const result = sanitizeForEventPay(input);

    // Assert
    expect(result).toBe(input);
  });
});

describe("メッセージ正規化処理", () => {
  test("複数の空白を1つに正規化する", () => {
    // Arrange
    const input = "これは    複数の   空白を    含みます";

    // Act
    const normalized = sanitizeForEventPay(input).trim().replace(/\s+/g, " ");

    // Assert
    expect(normalized).toBe("これは 複数の 空白を 含みます");
  });

  test("先頭と末尾の空白を削除する", () => {
    // Arrange
    const input = "  前後に空白があります  ";

    // Act
    const normalized = sanitizeForEventPay(input).trim();

    // Assert
    expect(normalized).toBe("前後に空白があります");
  });

  test("改行と空白の混在を正規化する", () => {
    // Arrange
    const input = "一行目\n\n   二行目\n三行目   ";

    // Act
    const normalized = sanitizeForEventPay(input).trim().replace(/\s+/g, " ");

    // Assert
    expect(normalized).toBe("一行目 二行目 三行目");
  });
});
