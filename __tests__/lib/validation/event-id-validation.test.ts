import { validateEventId } from "@/lib/validations/event-id";

describe("Event ID Validation", () => {
  describe("Green Phase - 機能テスト", () => {
    it("有効なUUIDv4形式の場合、バリデーションが通る", () => {
      const validUuid = "123e4567-e89b-12d3-a456-426614174000";
      const result = validateEventId(validUuid);
      expect(result.success).toBe(true);
      expect(result.data).toBe(validUuid);
    });

    it("空文字列の場合、バリデーションエラーが返される", () => {
      const result = validateEventId("");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("null値の場合、バリデーションエラーが返される", () => {
      // @ts-expect-error - Testing null input
      const result = validateEventId(null);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("undefined値の場合、バリデーションエラーが返される", () => {
      // @ts-expect-error - Testing undefined input
      const result = validateEventId(undefined);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("無効なUUID形式（短すぎる）の場合、バリデーションエラーが返される", () => {
      const invalidUuid = "123";
      const result = validateEventId(invalidUuid);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Invalid UUID format");
    });

    it("無効なUUID形式（ハイフンなし）の場合、バリデーションエラーが返される", () => {
      const invalidUuid = "123e4567e89b12d3a456426614174000";
      const result = validateEventId(invalidUuid);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Invalid UUID format");
    });

    it("無効なUUID形式（不正な文字を含む）の場合、バリデーションエラーが返される", () => {
      const invalidUuid = "123e4567-e89b-12d3-a456-42661417400g";
      const result = validateEventId(invalidUuid);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Invalid UUID format");
    });

    it("SQLインジェクション攻撃文字列の場合、バリデーションエラーが返される", () => {
      const maliciousInput = "'; DROP TABLE events; --";
      const result = validateEventId(maliciousInput);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Invalid UUID format");
    });

    it("XSS攻撃文字列の場合、バリデーションエラーが返される", () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const result = validateEventId(maliciousInput);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Invalid UUID format");
    });

    it("非常に長い文字列の場合、バリデーションエラーが返される", () => {
      const longString = "a".repeat(1000);
      const result = validateEventId(longString);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Invalid UUID format");
    });

    it("数値型の場合、バリデーションエラーが返される", () => {
      // @ts-expect-error - Testing number input
      const result = validateEventId(123);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("オブジェクト型の場合、バリデーションエラーが返される", () => {
      // @ts-expect-error - Testing object input
      const result = validateEventId({ id: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("配列型の場合、バリデーションエラーが返される", () => {
      // @ts-expect-error - Testing array input
      const result = validateEventId(["test"]);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
