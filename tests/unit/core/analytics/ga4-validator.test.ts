/**
 * @jest-environment node
 */

import { GA4Validator } from "../../../../core/analytics/ga4-validator";

describe("GA4Validator", () => {
  describe("validateClientId", () => {
    describe("正常系", () => {
      test("正しい形式のClient IDを受け入れる", () => {
        const validIds = [
          "1234567890.0987654321",
          "0000000000.0000000000",
          "9999999999.9999999999",
          "1111111111.2222222222",
        ];

        validIds.forEach((clientId) => {
          const result = GA4Validator.validateClientId(clientId);
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe("異常系 - 空文字", () => {
      test("空文字を拒否する", () => {
        const result = GA4Validator.validateClientId("");

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Client ID is empty");
      });
    });

    describe("異常系 - 無効なプレフィックス", () => {
      test("GA1.プレフィックスを拒否する", () => {
        const result = GA4Validator.validateClientId("GA1.1234567890.0987654321");

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Client ID contains invalid prefix: GA1.");
      });

      test("1..プレフィックスを拒否する", () => {
        const result = GA4Validator.validateClientId("1..234567890.0987654321");

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Client ID contains invalid prefix: 1..");
      });
    });

    describe("異常系 - パターン不一致", () => {
      test("桁数が不足しているClient IDを拒否する", () => {
        const invalidIds = [
          "123456789.0987654321", // 前半9桁
          "1234567890.098765432", // 後半9桁
          "12345.67890", // 両方不足
        ];

        invalidIds.forEach((clientId) => {
          const result = GA4Validator.validateClientId(clientId);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain(
            "Client ID does not match required format (10digits.10digits)"
          );
        });
      });

      test("桁数が超過しているClient IDを拒否する", () => {
        const invalidIds = [
          "12345678901.0987654321", // 前半11桁
          "1234567890.09876543210", // 後半11桁
        ];

        invalidIds.forEach((clientId) => {
          const result = GA4Validator.validateClientId(clientId);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain(
            "Client ID does not match required format (10digits.10digits)"
          );
        });
      });

      test("ピリオドがないClient IDを拒否する", () => {
        const result = GA4Validator.validateClientId("12345678900987654321");

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Client ID does not match required format (10digits.10digits)"
        );
      });

      test("複数のピリオドを含むClient IDを拒否する", () => {
        const result = GA4Validator.validateClientId("1234567890.0987.654321");

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Client ID does not match required format (10digits.10digits)"
        );
      });

      test("数字以外の文字を含むClient IDを拒否する", () => {
        const invalidIds = [
          "abcdefghij.0987654321",
          "1234567890.abcdefghij",
          "123456789a.0987654321",
          "1234567890.098765432a",
        ];

        invalidIds.forEach((clientId) => {
          const result = GA4Validator.validateClientId(clientId);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain(
            "Client ID does not match required format (10digits.10digits)"
          );
        });
      });
    });

    describe("複合エラー", () => {
      test("複数のエラーを同時に検出する", () => {
        const result = GA4Validator.validateClientId("GA1.123");

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain("Client ID contains invalid prefix: GA1.");
        expect(result.errors).toContain(
          "Client ID does not match required format (10digits.10digits)"
        );
      });
    });
  });

  describe("validateAndSanitizeParams", () => {
    describe("正常系", () => {
      test("有効なパラメータをそのまま返す", () => {
        const params = {
          event_name: "purchase",
          value: 100,
          currency: "USD",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitizedParams).toEqual(params);
      });

      test("アンダースコアを含むパラメータ名を受け入れる", () => {
        const params = {
          event_category: "test",
          event_label: "label",
          custom_param_123: "value",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });

      test("数値とブール値のパラメータを受け入れる", () => {
        const params = {
          count: 42,
          price: 99.99,
          is_active: true,
          is_disabled: false,
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });
    });

    describe("パラメータ名の検証", () => {
      test("無効な文字を含むパラメータ名を除外する", () => {
        const params = {
          "valid-name": "value1", // ハイフンは無効
          "invalid.name": "value2", // ドットは無効
          "invalid name": "value3", // スペースは無効
          valid_name: "value4", // これは有効
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.errors.length).toBe(3);
        expect(result.sanitizedParams).toEqual({ valid_name: "value4" });
      });

      test("40文字を超えるパラメータ名を除外する", () => {
        const longName = "a".repeat(41);
        const params = {
          [longName]: "value",
          short_name: "value",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual({ short_name: "value" });
      });

      test("40文字ちょうどのパラメータ名を受け入れる", () => {
        const exactName = "a".repeat(40);
        const params = {
          [exactName]: "value",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toHaveProperty(exactName);
      });
    });

    describe("文字列値のサニタイズ", () => {
      test("100文字以下の文字列をそのまま返す", () => {
        const params = {
          short_string: "short",
          exact_100: "a".repeat(100),
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams?.short_string).toBe("short");
        expect(result.sanitizedParams?.exact_100).toBe("a".repeat(100));
      });

      test("100文字を超える文字列を切り詰める", () => {
        const longString = "a".repeat(150);
        const params = {
          long_string: longString,
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams?.long_string).toBe("a".repeat(100));
        expect((result.sanitizedParams?.long_string as string).length).toBe(100);
      });

      test("複数の長い文字列を切り詰める", () => {
        const params = {
          string1: "a".repeat(150),
          string2: "b".repeat(200),
          string3: "short",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams?.string1).toBe("a".repeat(100));
        expect(result.sanitizedParams?.string2).toBe("b".repeat(100));
        expect(result.sanitizedParams?.string3).toBe("short");
      });
    });

    describe("デバッグモード", () => {
      test("デバッグモードで無効なパラメータをログ出力する", () => {
        const consoleSpy = jest.spyOn(console, "log").mockImplementation();

        const params = {
          "invalid-name": "value",
        };

        GA4Validator.validateAndSanitizeParams(params, true);

        expect(consoleSpy).toHaveBeenCalledWith(
          "[GA4] Skipping invalid parameter name: invalid-name"
        );

        consoleSpy.mockRestore();
      });

      test("デバッグモードで文字列切り詰めをログ出力する", () => {
        const consoleSpy = jest.spyOn(console, "log").mockImplementation();

        const params = {
          long_param: "a".repeat(150),
        };

        GA4Validator.validateAndSanitizeParams(params, true);

        expect(consoleSpy).toHaveBeenCalledWith(
          "[GA4] Truncated parameter long_param from 150 to 100 characters"
        );

        consoleSpy.mockRestore();
      });

      test("デバッグモードがfalseの場合はログ出力しない", () => {
        const consoleSpy = jest.spyOn(console, "log").mockImplementation();

        const params = {
          "invalid-name": "value",
          long_param: "a".repeat(150),
        };

        GA4Validator.validateAndSanitizeParams(params, false);

        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe("エッジケース", () => {
      test("空のパラメータオブジェクトを処理する", () => {
        const result = GA4Validator.validateAndSanitizeParams({});

        expect(result.isValid).toBe(false);
        expect(result.sanitizedParams).toEqual({});
      });

      test("すべてのパラメータが無効な場合", () => {
        const params = {
          "invalid-1": "value1",
          "invalid-2": "value2",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(false);
        expect(result.sanitizedParams).toEqual({});
      });

      test("undefined値を含むパラメータを処理する", () => {
        const params = {
          defined: "value",
          undefined_param: undefined,
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });

      test("null値を含むパラメータを処理する", () => {
        const params = {
          defined: "value",
          null_param: null,
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });

      test("配列値を含むパラメータを処理する", () => {
        const params = {
          array_param: [1, 2, 3],
          string_param: "value",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });

      test("オブジェクト値を含むパラメータを処理する", () => {
        const params = {
          object_param: { nested: "value" },
          string_param: "value",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });
    });

    describe("実用的なユースケース", () => {
      test("GA4イベントパラメータの典型的な例", () => {
        const params = {
          event_category: "engagement",
          event_label: "button_click",
          value: 1,
          page_path: "/dashboard",
          user_id: "user123",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual(params);
      });

      test("無効なパラメータと有効なパラメータが混在する場合", () => {
        const params = {
          valid_param: "value",
          "invalid-param": "should be excluded",
          another_valid: 123,
          "also.invalid": "excluded",
        };

        const result = GA4Validator.validateAndSanitizeParams(params);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedParams).toEqual({
          valid_param: "value",
          another_valid: 123,
        });
      });
    });
  });
});
