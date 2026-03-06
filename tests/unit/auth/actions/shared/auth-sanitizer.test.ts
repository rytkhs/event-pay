import { jest } from "@jest/globals";

import {
  sanitizeEmailOrNull,
  sanitizeName,
  sanitizePasswordOrNull,
} from "@features/auth/services/shared/auth-sanitizer";

const mockSanitizeEmail = jest.fn();
const mockSanitizePassword = jest.fn();

jest.mock("@core/auth-security", () => ({
  InputSanitizer: {
    sanitizeEmail: (...args: unknown[]) => mockSanitizeEmail(...args),
    sanitizePassword: (...args: unknown[]) => mockSanitizePassword(...args),
  },
}));

describe("auth-sanitizer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("sanitizeEmailOrNull: 成功時は文字列を返す", () => {
    mockSanitizeEmail.mockReturnValue("user@example.com");

    expect(sanitizeEmailOrNull("USER@example.com")).toBe("user@example.com");
  });

  test("sanitizeEmailOrNull: 失敗時はnullを返す", () => {
    mockSanitizeEmail.mockImplementation(() => {
      throw new Error("invalid");
    });

    expect(sanitizeEmailOrNull("bad")).toBeNull();
  });

  test("sanitizePasswordOrNull: 失敗時はnullを返す", () => {
    mockSanitizePassword.mockImplementation(() => {
      throw new Error("invalid");
    });

    expect(sanitizePasswordOrNull("bad")).toBeNull();
  });

  test("sanitizeName: trim済み文字列を返す", () => {
    expect(sanitizeName("  Taro  ")).toBe("Taro");
  });
});
