import { generateInviteToken, isValidInviteToken } from "@/lib/utils/invite-token";

describe("Invite Token Utils", () => {
  describe("generateInviteToken", () => {
    it("should generate a 36-character token with inv_ prefix", () => {
      const token = generateInviteToken();
      expect(token).toHaveLength(36);
      expect(token).toMatch(/^inv_[a-zA-Z0-9_-]{32}$/);
    });

    it("should generate URL-safe characters only", () => {
      const token = generateInviteToken();
      expect(token).toMatch(/^inv_[a-zA-Z0-9_-]{32}$/);
    });

    it("should generate unique tokens", () => {
      const token1 = generateInviteToken();
      const token2 = generateInviteToken();
      expect(token1).not.toBe(token2);
    });

    it("should generate tokens without padding characters", () => {
      const token = generateInviteToken();
      expect(token).not.toContain("=");
    });
  });

  describe("isValidInviteToken", () => {
    it("should return true for valid tokens with inv_ prefix", () => {
      const validToken = "inv_abcdefghijklmnopqrstuvwxyz123456";
      expect(isValidInviteToken(validToken)).toBe(true);
    });

    it("should return false for short tokens", () => {
      const shortToken = "short";
      expect(isValidInviteToken(shortToken)).toBe(false);
    });

    it("should return false for long tokens", () => {
      const longToken = "a".repeat(33);
      expect(isValidInviteToken(longToken)).toBe(false);
    });

    it("should return false for tokens with invalid characters", () => {
      const invalidToken = "abcdefghijklmnopqrstuvwxyz123@#$";
      expect(isValidInviteToken(invalidToken)).toBe(false);
    });

    it("should return true for tokens with underscores and hyphens", () => {
      const validToken = "abcdefgh_ijklmno-pqrstuvwxyz1234";
      expect(isValidInviteToken(validToken)).toBe(true);
    });

    it("should return false for empty string", () => {
      expect(isValidInviteToken("")).toBe(false);
    });
  });
});
