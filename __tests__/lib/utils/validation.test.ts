import {
  ValidationError,
  validateNumberRange,
  validateProgress,
  validateCSSTime,
  validateEnum,
  validateStringLength,
  safeValidate,
} from "@/lib/utils/validation";

describe("validation utilities", () => {
  describe("ValidationError", () => {
    test("基本的なエラー作成ができること", () => {
      const error = new ValidationError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ValidationError");
      expect(error.field).toBeUndefined();
      expect(error.code).toBeUndefined();
    });

    test("フィールドとコード付きエラーが作成できること", () => {
      const error = new ValidationError("Test error", "testField", "TEST_CODE");
      expect(error.message).toBe("Test error");
      expect(error.field).toBe("testField");
      expect(error.code).toBe("TEST_CODE");
    });
  });

  describe("validateNumberRange", () => {
    test("有効な数値の場合、そのまま返すこと", () => {
      expect(validateNumberRange(50, 0, 100)).toBe(50);
      expect(validateNumberRange(0, 0, 100)).toBe(0);
      expect(validateNumberRange(100, 0, 100)).toBe(100);
    });

    test("数値以外の場合、エラーを投げること", () => {
      expect(() => validateNumberRange(NaN, 0, 100)).toThrow(ValidationError);
      expect(() => validateNumberRange("50" as any, 0, 100)).toThrow(ValidationError);
    });

    test("範囲外の場合、エラーを投げること", () => {
      expect(() => validateNumberRange(-1, 0, 100)).toThrow(ValidationError);
      expect(() => validateNumberRange(101, 0, 100)).toThrow(ValidationError);
    });

    test("カスタムフィールド名でエラーメッセージが生成されること", () => {
      expect(() => validateNumberRange(-1, 0, 100, "customField")).toThrow(
        "customField must be between 0 and 100"
      );
    });
  });

  describe("validateProgress", () => {
    test("有効な進捗値の場合、そのまま返すこと", () => {
      expect(validateProgress(0)).toBe(0);
      expect(validateProgress(50)).toBe(50);
      expect(validateProgress(100)).toBe(100);
    });

    test("無効な進捗値の場合、エラーを投げること", () => {
      expect(() => validateProgress(-1)).toThrow(ValidationError);
      expect(() => validateProgress(101)).toThrow(ValidationError);
      expect(() => validateProgress(NaN)).toThrow(ValidationError);
    });
  });

  describe("validateCSSTime", () => {
    test("有効なCSS時間値の場合、そのまま返すこと", () => {
      expect(validateCSSTime("1s")).toBe("1s");
      expect(validateCSSTime("500ms")).toBe("500ms");
      expect(validateCSSTime("1.5s")).toBe("1.5s");
      expect(validateCSSTime("0.1s")).toBe("0.1s");
    });

    test("無効なCSS時間値の場合、エラーを投げること", () => {
      expect(() => validateCSSTime("1")).toThrow(ValidationError);
      expect(() => validateCSSTime("1sec")).toThrow(ValidationError);
      expect(() => validateCSSTime("invalid")).toThrow(ValidationError);
      expect(() => validateCSSTime("")).toThrow(ValidationError);
    });
  });

  describe("validateEnum", () => {
    const allowedValues = ["option1", "option2", "option3"] as const;

    test("有効な列挙値の場合、そのまま返すこと", () => {
      expect(validateEnum("option1", allowedValues)).toBe("option1");
      expect(validateEnum("option2", allowedValues)).toBe("option2");
      expect(validateEnum("option3", allowedValues)).toBe("option3");
    });

    test("無効な列挙値の場合、エラーを投げること", () => {
      expect(() => validateEnum("invalid" as any, allowedValues)).toThrow(ValidationError);
      expect(() => validateEnum("" as any, allowedValues)).toThrow(ValidationError);
    });

    test("カスタムフィールド名でエラーメッセージが生成されること", () => {
      expect(() => validateEnum("invalid" as any, allowedValues, "customField")).toThrow(
        "customField must be one of: option1, option2, option3"
      );
    });
  });

  describe("validateStringLength", () => {
    test("有効な文字列長の場合、そのまま返すこと", () => {
      expect(validateStringLength("test", 1, 10)).toBe("test");
      expect(validateStringLength("", 0, 10)).toBe("");
      expect(validateStringLength("1234567890", 1, 10)).toBe("1234567890");
    });

    test("文字列以外の場合、エラーを投げること", () => {
      expect(() => validateStringLength(123 as any)).toThrow(ValidationError);
      expect(() => validateStringLength(null as any)).toThrow(ValidationError);
    });

    test("短すぎる文字列の場合、エラーを投げること", () => {
      expect(() => validateStringLength("", 1, 10)).toThrow(ValidationError);
      expect(() => validateStringLength("abc", 5, 10)).toThrow(ValidationError);
    });

    test("長すぎる文字列の場合、エラーを投げること", () => {
      expect(() => validateStringLength("12345678901", 1, 10)).toThrow(ValidationError);
    });
  });

  describe("safeValidate", () => {
    test("成功する場合、検証結果を返すこと", () => {
      const validator = () => "valid result";
      expect(safeValidate(validator, "default")).toBe("valid result");
    });

    test("失敗する場合、デフォルト値を返すこと", () => {
      const validator = () => {
        throw new Error("Validation failed");
      };
      expect(safeValidate(validator, "default value")).toBe("default value");
    });

    test("エラーメッセージ付きで失敗をログ出力すること", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const validator = () => {
        throw new Error("Validation failed");
      };

      safeValidate(validator, "default", "Custom error message");

      expect(consoleSpy).toHaveBeenCalledWith("Custom error message", expect.any(Error));

      consoleSpy.mockRestore();
    });

    test("エラーメッセージなしの場合、ログ出力しないこと", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const validator = () => {
        throw new Error("Validation failed");
      };

      safeValidate(validator, "default");

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
