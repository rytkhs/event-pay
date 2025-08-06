/**
 * RLSベースゲストトークンバリデーターの基本テスト
 */

import { RLSGuestTokenValidator } from "@/lib/security/guest-token-validator";
import { GuestErrorCode } from "@/lib/security/guest-token-errors";

describe("RLSGuestTokenValidator", () => {
  let validator: RLSGuestTokenValidator;

  beforeEach(() => {
    validator = new RLSGuestTokenValidator();
  });

  describe("validateTokenFormat", () => {
    it("有効なフォーマットのトークンを受け入れる", () => {
      const validToken = "gst_" + "a".repeat(32);
      expect(validator.validateTokenFormat(validToken)).toBe(true);
    });

    it("無効なフォーマットのトークンを拒否する", () => {
      expect(validator.validateTokenFormat("")).toBe(false);
      expect(validator.validateTokenFormat("short")).toBe(false);
      expect(validator.validateTokenFormat("gst_short")).toBe(false);
      expect(validator.validateTokenFormat("invalid_prefix_" + "a".repeat(32))).toBe(false);
    });
  });

  describe("validateToken", () => {
    it("無効なフォーマットのトークンでエラーを返す", async () => {
      const result = await validator.validateToken("invalid");

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(GuestErrorCode.INVALID_FORMAT);
      expect(result.canModify).toBe(false);
    });

    it("有効なフォーマットでもデータベースに存在しない場合はエラーを返す", async () => {
      const validToken = "gst_" + "a".repeat(32);
      const result = await validator.validateToken(validToken);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(GuestErrorCode.TOKEN_NOT_FOUND);
      expect(result.canModify).toBe(false);
    });
  });

  describe("createGuestClient", () => {
    it("有効なトークンでクライアントを作成できる", () => {
      const validToken = "gst_" + "a".repeat(32);

      expect(() => {
        validator.createGuestClient(validToken);
      }).not.toThrow();
    });

    it("無効なトークンでエラーを投げる", () => {
      expect(() => {
        validator.createGuestClient("invalid");
      }).toThrow();
    });
  });
});