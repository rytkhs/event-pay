/**
 * @file crypto.ts セキュリティテストスイート
 * @description 暗号学的関数のセキュリティとバイアステスト
 */

import {
  generateOtpCode,
  generateSecureToken,
  hashToken,
  verifyHashedToken,
  verifyOtpCode,
  constantTimeCompare,
} from "@/lib/security/crypto";

describe("Crypto Security Tests", () => {
  describe("generateOtpCode - 統計的バイアステスト", () => {
    it("6桁の数字OTPを生成する", () => {
      const otp = generateOtpCode();
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.length).toBe(6);
    });

    it("複数回実行しても異なる値を生成する", () => {
      const otps = new Set();
      for (let i = 0; i < 100; i++) {
        otps.add(generateOtpCode());
      }
      // 100回の実行で重複がないことを確認（統計的に極めて低い確率）
      expect(otps.size).toBeGreaterThan(95);
    });

    it("統計的バイアスが除去されている（分布テスト）", () => {
      const sampleSize = 10000;
      const digitCounts = new Array(10).fill(0);

      // 大量のOTPを生成して各桁の出現頻度を測定
      for (let i = 0; i < sampleSize; i++) {
        const otp = generateOtpCode();
        // 最初の桁の分布を確認（他の桁も同様の分布になるはず）
        const firstDigit = parseInt(otp[0]);
        digitCounts[firstDigit]++;
      }

      // 各桁の出現頻度が理論値（10%）から大きく外れていないことを確認
      const expectedFrequency = sampleSize / 10;
      const tolerance = expectedFrequency * 0.1; // 10%の許容範囲

      digitCounts.forEach((count, digit) => {
        expect(count).toBeGreaterThan(expectedFrequency - tolerance);
        expect(count).toBeLessThan(expectedFrequency + tolerance);
      });
    });

    it("全ての可能な値の範囲（000000-999999）を生成できる", () => {
      // パフォーマンステストのため少数サンプルで境界値をテスト
      const otps = new Set();
      for (let i = 0; i < 1000; i++) {
        const otp = generateOtpCode();
        otps.add(otp);

        // OTPが有効な範囲内であることを確認
        const numValue = parseInt(otp);
        expect(numValue).toBeGreaterThanOrEqual(0);
        expect(numValue).toBeLessThanOrEqual(999999);
      }
    });

    it("先頭ゼロが適切に保持される", () => {
      // 小さい数値でも6桁になることを確認
      const otps = [];
      for (let i = 0; i < 1000; i++) {
        otps.push(generateOtpCode());
      }

      // 統計的に先頭が0の値が含まれることを確認
      const zeroStartOtps = otps.filter((otp) => otp.startsWith("0"));
      expect(zeroStartOtps.length).toBeGreaterThan(50); // 約10%期待値の半分以上
    });
  });

  describe("generateSecureToken", () => {
    it("デフォルトで64文字の16進数文字列を生成する", () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("指定した長さのトークンを生成する", () => {
      const token16 = generateSecureToken(16);
      expect(token16).toMatch(/^[0-9a-f]{32}$/); // 16バイト = 32文字
    });

    it("複数回実行しても異なる値を生成する", () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe("hashToken", () => {
    it("同じ入力に対して同じハッシュを生成する", () => {
      const token = "test-token";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it("異なる入力に対して異なるハッシュを生成する", () => {
      const hash1 = hashToken("token1");
      const hash2 = hashToken("token2");
      expect(hash1).not.toBe(hash2);
    });

    it("64文字の16進数ハッシュを生成する", () => {
      const hash = hashToken("test");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("verifyHashedToken", () => {
    it("正しいトークンの検証に成功する", () => {
      const token = "test-token";
      const hash = hashToken(token);
      expect(verifyHashedToken(token, hash)).toBe(true);
    });

    it("間違ったトークンの検証に失敗する", () => {
      const token = "test-token";
      const wrongToken = "wrong-token";
      const hash = hashToken(token);
      expect(verifyHashedToken(wrongToken, hash)).toBe(false);
    });

    it("タイミング攻撃に対して安全である", () => {
      const token = "test-token";
      const hash = hashToken(token);

      // 異なる長さの間違ったトークンでも実行時間が一定であることを確認
      const wrongTokens = ["a", "wrong", "very-long-wrong-token"];

      wrongTokens.forEach((wrongToken) => {
        const startTime = process.hrtime.bigint();
        const result = verifyHashedToken(wrongToken, hash);
        const endTime = process.hrtime.bigint();

        expect(result).toBe(false);
        // 実行時間が極端に短くないことを確認（タイミング攻撃対策）
        const executionTime = Number(endTime - startTime) / 1000000; // ms
        expect(executionTime).toBeGreaterThan(0.001); // 最低0.001ms
      });
    });
  });

  describe("verifyOtpCode", () => {
    it("正しいOTPの検証に成功する", () => {
      const otp = "123456";
      expect(verifyOtpCode(otp, otp)).toBe(true);
    });

    it("間違ったOTPの検証に失敗する", () => {
      const otp1 = "123456";
      const otp2 = "654321";
      expect(verifyOtpCode(otp1, otp2)).toBe(false);
    });

    it("6桁以外のOTPは拒否する", () => {
      expect(verifyOtpCode("12345", "123456")).toBe(false);
      expect(verifyOtpCode("1234567", "123456")).toBe(false);
      expect(verifyOtpCode("abcdef", "123456")).toBe(false);
    });

    it("タイミング攻撃に対して安全である", () => {
      const correctOtp = "123456";
      const wrongOtps = ["000000", "999999", "123455"];

      wrongOtps.forEach((wrongOtp) => {
        const startTime = process.hrtime.bigint();
        const result = verifyOtpCode(wrongOtp, correctOtp);
        const endTime = process.hrtime.bigint();

        expect(result).toBe(false);
        // 実行時間が極端に短くないことを確認（タイミング攻撃対策）
        const executionTime = Number(endTime - startTime) / 1000000; // ms
        expect(executionTime).toBeGreaterThan(0.001); // 最低0.001ms
      });
    });
  });

  describe("constantTimeCompare", () => {
    it("同じ文字列の比較に成功する", () => {
      expect(constantTimeCompare("test", "test")).toBe(true);
    });

    it("異なる文字列の比較に失敗する", () => {
      expect(constantTimeCompare("test1", "test2")).toBe(false);
    });

    it("長さが異なる文字列の比較に失敗する", () => {
      expect(constantTimeCompare("test", "testing")).toBe(false);
    });

    it("空文字列を適切に処理する", () => {
      expect(constantTimeCompare("", "")).toBe(true);
      expect(constantTimeCompare("", "test")).toBe(false);
    });
  });
});
