/**
 * @jest-environment node
 */

import { GA4Error, GA4ErrorCode } from "../../../../core/analytics/ga4-error";

describe("GA4Error", () => {
  describe("基本的なエラー生成", () => {
    test("メッセージとコードでエラーを生成できる", () => {
      const error = new GA4Error("Test error message", GA4ErrorCode.TIMEOUT);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GA4Error);
      expect(error.message).toBe("Test error message");
      expect(error.code).toBe(GA4ErrorCode.TIMEOUT);
      expect(error.name).toBe("GA4Error");
      expect(error.context).toBeUndefined();
    });

    test("コンテキスト付きでエラーを生成できる", () => {
      const context = { clientId: "1234567890.0987654321", attempt: 3 };
      const error = new GA4Error("Retry exhausted", GA4ErrorCode.RETRY_EXHAUSTED, context);

      expect(error.message).toBe("Retry exhausted");
      expect(error.code).toBe(GA4ErrorCode.RETRY_EXHAUSTED);
      expect(error.context).toEqual(context);
    });
  });

  describe("エラーコード定数", () => {
    test("すべてのエラーコードが定義されている", () => {
      expect(GA4ErrorCode.TIMEOUT).toBe("GA4_TIMEOUT");
      expect(GA4ErrorCode.INVALID_CLIENT_ID).toBe("GA4_INVALID_CLIENT_ID");
      expect(GA4ErrorCode.INVALID_PARAMETER).toBe("GA4_INVALID_PARAMETER");
      expect(GA4ErrorCode.API_ERROR).toBe("GA4_API_ERROR");
      expect(GA4ErrorCode.RETRY_EXHAUSTED).toBe("GA4_RETRY_EXHAUSTED");
      expect(GA4ErrorCode.CONFIGURATION_ERROR).toBe("GA4_CONFIGURATION_ERROR");
    });

    test("各エラーコードでエラーを生成できる", () => {
      const codes = Object.values(GA4ErrorCode);

      codes.forEach((code) => {
        const error = new GA4Error(`Test ${code}`, code);
        expect(error.code).toBe(code);
      });
    });
  });

  describe("スタックトレース", () => {
    test("スタックトレースが正しく設定される", () => {
      const error = new GA4Error("Stack trace test", GA4ErrorCode.API_ERROR);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("GA4Error");
      expect(error.stack).toContain("Stack trace test");
    });

    test("throwされたエラーのスタックトレースが取得できる", () => {
      try {
        throw new GA4Error("Thrown error", GA4ErrorCode.TIMEOUT);
      } catch (error) {
        expect(error).toBeInstanceOf(GA4Error);
        if (error instanceof GA4Error) {
          expect(error.stack).toBeDefined();
          expect(error.stack).toContain("ga4-error.test.ts");
        }
      }
    });
  });

  describe("コンテキストの型", () => {
    test("様々な型のコンテキストを受け入れる", () => {
      const contexts = [
        { string: "value" },
        { number: 123 },
        { boolean: true },
        { array: [1, 2, 3] },
        { nested: { key: "value" } },
        { mixed: { str: "text", num: 42, bool: false } },
      ];

      contexts.forEach((context) => {
        const error = new GA4Error("Context test", GA4ErrorCode.API_ERROR, context);
        expect(error.context).toEqual(context);
      });
    });

    test("空のコンテキストオブジェクトを受け入れる", () => {
      const error = new GA4Error("Empty context", GA4ErrorCode.API_ERROR, {});

      expect(error.context).toEqual({});
    });
  });

  describe("エラーハンドリング", () => {
    test("try-catchでキャッチできる", () => {
      expect(() => {
        throw new GA4Error("Catchable error", GA4ErrorCode.TIMEOUT);
      }).toThrow(GA4Error);
    });

    test("instanceof チェックが正しく動作する", () => {
      const error = new GA4Error("Instance test", GA4ErrorCode.API_ERROR);

      expect(error instanceof GA4Error).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    test("エラーメッセージでマッチできる", () => {
      expect(() => {
        throw new GA4Error("Specific message", GA4ErrorCode.TIMEOUT);
      }).toThrow("Specific message");
    });
  });

  describe("実用的なユースケース", () => {
    test("タイムアウトエラーのシナリオ", () => {
      const error = new GA4Error("Client ID retrieval timed out", GA4ErrorCode.TIMEOUT, {
        timeoutMs: 3000,
        operation: "getClientId",
      });

      expect(error.code).toBe(GA4ErrorCode.TIMEOUT);
      expect(error.context?.timeoutMs).toBe(3000);
      expect(error.context?.operation).toBe("getClientId");
    });

    test("無効なClient IDエラーのシナリオ", () => {
      const error = new GA4Error("Client ID validation failed", GA4ErrorCode.INVALID_CLIENT_ID, {
        clientId: "GA1.invalid",
        errors: ["Client ID contains invalid prefix: GA1."],
      });

      expect(error.code).toBe(GA4ErrorCode.INVALID_CLIENT_ID);
      expect(error.context?.clientId).toBe("GA1.invalid");
    });

    test("APIエラーのシナリオ", () => {
      const error = new GA4Error("HTTP 500: Internal Server Error", GA4ErrorCode.API_ERROR, {
        status: 500,
        statusText: "Internal Server Error",
        attempt: 3,
      });

      expect(error.code).toBe(GA4ErrorCode.API_ERROR);
      expect(error.context?.status).toBe(500);
      expect(error.context?.attempt).toBe(3);
    });

    test("リトライ失敗エラーのシナリオ", () => {
      const error = new GA4Error("All retry attempts failed", GA4ErrorCode.RETRY_EXHAUSTED, {
        maxRetries: 3,
        lastError: "Network timeout",
        totalDelay: 7000,
      });

      expect(error.code).toBe(GA4ErrorCode.RETRY_EXHAUSTED);
      expect(error.context?.maxRetries).toBe(3);
      expect(error.context?.lastError).toBe("Network timeout");
    });
  });
});
