/**
 * Edge runtime対応のcrypto関数テスト
 * Web Crypto APIとNode.js crypto両方での動作確認
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import {
  generateRandomBytes,
  toBase64UrlSafe,
  generateSecureToken,
  generateOtpCode,
  generateSecureUuid,
} from "@/lib/security/crypto";

describe("Edge Runtime Compatible Crypto Functions", () => {
  describe("generateRandomBytes", () => {
    it("should generate bytes of specified length using Web Crypto API", () => {
      // 既存のcryptoを一時的に保存
      const originalCrypto = global.crypto;

      // Web Crypto APIが利用可能な環境をシミュレート
      const mockGetRandomValues = jest.fn().mockImplementation((bytes: Uint8Array) => {
        // テスト用の固定値で埋める
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = i % 256;
        }
        return bytes;
      });

      // グローバルcryptoを明示的に上書き
      Object.defineProperty(global, "crypto", {
        value: {
          getRandomValues: mockGetRandomValues,
        },
        writable: true,
        configurable: true,
      });

      const bytes = generateRandomBytes(16);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
      expect(mockGetRandomValues).toHaveBeenCalledTimes(1);

      // 期待値との比較（0, 1, 2, ..., 15）
      for (let i = 0; i < 16; i++) {
        expect(bytes[i]).toBe(i);
      }

      // 元のcryptoを復元
      if (originalCrypto) {
        Object.defineProperty(global, "crypto", {
          value: originalCrypto,
          writable: true,
          configurable: true,
        });
      } else {
        delete (global as any).crypto;
      }
    });

    it("should fallback to Node.js crypto.randomBytes when Web Crypto is unavailable", () => {
      // Web Crypto APIを無効化
      delete (global as any).crypto;

      const bytes = generateRandomBytes(16);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it("should throw error when no secure random generator is available", () => {
      // Web Crypto APIを無効化
      delete (global as any).crypto;

      // Node.js randomBytesもモックで無効化
      jest.doMock("crypto", () => ({}));

      expect(() => {
        // 動的インポートして新しいモジュールを取得
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { generateRandomBytes: testGenerateRandomBytes } = require("@/lib/security/crypto");
          testGenerateRandomBytes(16);
        });
      }).toThrow("No secure random number generator available");
    });
  });

  describe("toBase64UrlSafe", () => {
    it("should convert bytes to URL-safe base64", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"のUTF-8
      const result = toBase64UrlSafe(bytes);

      // "Hello"のBase64は"SGVsbG8="、URL-safeでは"SGVsbG8"
      expect(result).toBe("SGVsbG8");
      expect(result).not.toContain("+");
      expect(result).not.toContain("/");
      expect(result).not.toContain("=");
    });

    it("should handle bytes that produce + and / in base64", () => {
      // Base64で+と/が出現するバイト列をテスト
      const bytes = new Uint8Array([255, 254, 253, 252]);
      const result = toBase64UrlSafe(bytes);

      expect(result).not.toContain("+");
      expect(result).not.toContain("/");
      expect(result).not.toContain("=");
      expect(result).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe("generateSecureToken", () => {
    beforeEach(() => {
      // Web Crypto APIをモック
      (global as any).crypto = {
        getRandomValues: jest.fn().mockImplementation((bytes: Uint8Array) => {
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = i % 256;
          }
          return bytes;
        }),
      };
    });

    it("should generate hex token of correct length", () => {
      const token = generateSecureToken(16);

      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(token.length).toBe(32); // 16バイト = 32文字の16進数
    });

    it("should generate different tokens on multiple calls", () => {
      // ランダム値を変える
      let counter = 0;
      (global as any).crypto.getRandomValues = jest.fn().mockImplementation((bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = (i + counter) % 256;
        }
        counter++;
        return bytes;
      });

      const token1 = generateSecureToken(16);
      const token2 = generateSecureToken(16);

      expect(token1).not.toBe(token2);
    });
  });

  describe("generateOtpCode", () => {
    beforeEach(() => {
      // 予測可能な値を返すWeb Crypto APIモック
      (global as any).crypto = {
        getRandomValues: jest.fn().mockImplementation((bytes: Uint8Array) => {
          // 123456のOTPが生成されるような値を設定
          const testValue = 123456;
          bytes[0] = (testValue >>> 24) & 0xff;
          bytes[1] = (testValue >>> 16) & 0xff;
          bytes[2] = (testValue >>> 8) & 0xff;
          bytes[3] = testValue & 0xff;
          return bytes;
        }),
      };
    });

    it("should generate 6-digit OTP code", () => {
      const otp = generateOtpCode();

      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.length).toBe(6);
      expect(otp).toBe("123456");
    });

    it("should pad with leading zeros if needed", () => {
      // 小さな値を返すモック（先頭が0になるケース）
      (global as any).crypto.getRandomValues = jest.fn().mockImplementation((bytes: Uint8Array) => {
        const testValue = 123; // "000123"になるはず
        bytes[0] = (testValue >>> 24) & 0xff;
        bytes[1] = (testValue >>> 16) & 0xff;
        bytes[2] = (testValue >>> 8) & 0xff;
        bytes[3] = testValue & 0xff;
        return bytes;
      });

      const otp = generateOtpCode();
      expect(otp).toBe("000123");
    });
  });

  describe("generateSecureUuid", () => {
    beforeEach(() => {
      // 予測可能なUUIDテスト用の値
      (global as any).crypto = {
        getRandomValues: jest.fn().mockImplementation((bytes: Uint8Array) => {
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = i;
          }
          return bytes;
        }),
      };
    });

    it("should generate valid UUID v4", () => {
      const uuid = generateSecureUuid();

      // UUID v4の形式チェック
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      // バージョン4の確認（13番目の文字が'4'）
      expect(uuid[14]).toBe("4");

      // バリアント2の確認（17番目の文字が8,9,a,bのいずれか）
      expect(["8", "9", "a", "b"]).toContain(uuid[19]);
    });

    it("should generate unique UUIDs", () => {
      // ランダム値を変える
      let counter = 0;
      (global as any).crypto.getRandomValues = jest.fn().mockImplementation((bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = (i + counter) % 256;
        }
        counter++;
        return bytes;
      });

      const uuid1 = generateSecureUuid();
      const uuid2 = generateSecureUuid();

      expect(uuid1).not.toBe(uuid2);
    });
  });

  afterEach(() => {
    // グローバル状態をクリーンアップ
    delete (global as any).crypto;
    jest.clearAllMocks();
    jest.resetModules();
  });
});
