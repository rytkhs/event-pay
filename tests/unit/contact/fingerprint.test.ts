/**
 * お問い合わせ機能 - 指紋ハッシュ生成のテスト
 */

import { hmacSha256Hex } from "@core/rate-limit/hash";

describe("指紋ハッシュ生成 - お問い合わせ重複防止", () => {
  const mockEmail = "test@example.com";
  const mockMessage = "これはテストメッセージです";
  const mockDate = "2025-10-12";

  test("同一内容は同じハッシュを生成する", () => {
    // Arrange
    const input = `${mockEmail}|${mockMessage}|${mockDate}`;

    // Act
    const hash1 = hmacSha256Hex(input);
    const hash2 = hmacSha256Hex(input);

    // Assert
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256は64文字のHEX
  });

  test("異なるメールアドレスは異なるハッシュを生成する", () => {
    // Arrange
    const input1 = `test1@example.com|${mockMessage}|${mockDate}`;
    const input2 = `test2@example.com|${mockMessage}|${mockDate}`;

    // Act
    const hash1 = hmacSha256Hex(input1);
    const hash2 = hmacSha256Hex(input2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });

  test("異なるメッセージは異なるハッシュを生成する", () => {
    // Arrange
    const input1 = `${mockEmail}|メッセージ1|${mockDate}`;
    const input2 = `${mockEmail}|メッセージ2|${mockDate}`;

    // Act
    const hash1 = hmacSha256Hex(input1);
    const hash2 = hmacSha256Hex(input2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });

  test("異なる日付は異なるハッシュを生成する", () => {
    // Arrange
    const input1 = `${mockEmail}|${mockMessage}|2025-10-12`;
    const input2 = `${mockEmail}|${mockMessage}|2025-10-13`;

    // Act
    const hash1 = hmacSha256Hex(input1);
    const hash2 = hmacSha256Hex(input2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });

  test("空白の違いによって異なるハッシュを生成する", () => {
    // Arrange
    const input1 = `${mockEmail}|メッセージ|${mockDate}`;
    const input2 = `${mockEmail}|メッセージ |${mockDate}`; // 末尾に空白

    // Act
    const hash1 = hmacSha256Hex(input1);
    const hash2 = hmacSha256Hex(input2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });

  test("ハッシュは予測不可能である", () => {
    // Arrange
    const input = `${mockEmail}|${mockMessage}|${mockDate}`;

    // Act
    const hash = hmacSha256Hex(input);

    // Assert
    // 元の文字列がハッシュに含まれていないことを確認
    expect(hash.toLowerCase()).not.toContain(mockEmail.toLowerCase());
    expect(hash).not.toContain(mockMessage);
    expect(hash).not.toContain(mockDate);
  });

  test("正規化後のメッセージで指紋を生成する", () => {
    // Arrange
    const rawMessage = "  これは    テスト   です  ";
    const normalizedMessage = rawMessage.trim().replace(/\s+/g, " ");
    const input = `${mockEmail}|${normalizedMessage}|${mockDate}`;

    // Act
    const hash = hmacSha256Hex(input);

    // Assert
    expect(hash).toHaveLength(64);
    // 正規化されたメッセージから生成されることを確認
    const expectedInput = `${mockEmail}|これは テスト です|${mockDate}`;
    expect(hmacSha256Hex(expectedInput)).toBe(hash);
  });
});

describe("IPハッシュ生成", () => {
  test("IPアドレスをハッシュ化する", () => {
    // Arrange
    const ip = "192.168.1.1";

    // Act
    const hash = hmacSha256Hex(ip);

    // Assert
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(ip);
  });

  test("同じIPは同じハッシュを生成する", () => {
    // Arrange
    const ip = "203.0.113.42";

    // Act
    const hash1 = hmacSha256Hex(ip);
    const hash2 = hmacSha256Hex(ip);

    // Assert
    expect(hash1).toBe(hash2);
  });

  test("異なるIPは異なるハッシュを生成する", () => {
    // Arrange
    const ip1 = "192.168.1.1";
    const ip2 = "192.168.1.2";

    // Act
    const hash1 = hmacSha256Hex(ip1);
    const hash2 = hmacSha256Hex(ip2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });
});
