/**
 * error-handler.client.ts のユニットテスト
 * クライアント専用機能（ErrorLogger連携）のテスト
 */

import { jest } from "@jest/globals";

jest.mock("@/components/errors/error-logger", () => ({
  errorLogger: {
    logError: jest.fn().mockImplementation(() => Promise.resolve()),
  },
}));

import { errorLogger } from "../../../../components/errors/error-logger";
import {
  handleClientError,
  getErrorDetails,
  getUserErrorMessage,
  isRetryableError,
  getErrorSeverity,
  normalizeToErrorDetails,
} from "../../../../core/utils/error-handler.client";

describe("error-handler.client", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 環境変数をモック
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    return () => {
      process.env.NODE_ENV = originalEnv;
    };
  });

  describe("handleClientError", () => {
    it("TypeError fetchエラーをNETWORK_ERRORに変換", () => {
      const error = new TypeError("Failed to fetch");
      const result = handleClientError(error);

      expect(result.code).toBe("NETWORK_ERROR");
      expect(result.severity).toBe("medium");
      expect(result.shouldAlert).toBe(false);
    });

    it("文字列エラーコードを処理", () => {
      const result = handleClientError("VALIDATION_ERROR");

      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.severity).toBe("low");
      expect(result.userMessage).toBe("入力内容に問題があります。正しい形式で入力してください。");
    });

    it("codeプロパティを持つオブジェクトを処理", () => {
      const error = { code: "UNAUTHORIZED" };
      const result = handleClientError(error);

      expect(result.code).toBe("UNAUTHORIZED");
      expect(result.severity).toBe("medium");
    });

    it("未知のエラーをUNKNOWN_ERRORに正規化", () => {
      const error = { unknown: "value" };
      const result = handleClientError(error);

      expect(result.code).toBe("UNKNOWN_ERROR");
      expect(result.severity).toBe("medium");
    });

    it("contextのseverityで重要度を上書き", () => {
      const error = "VALIDATION_ERROR"; // 元は low severity
      const context = {
        action: "testAction",
        severity: "critical" as const,
      };

      const result = handleClientError(error, context);

      expect(result.severity).toBe("critical");
      expect(result.shouldAlert).toBe(true);
    });

    it("shouldAlert: true の場合、ErrorLogger.logError を呼び出す", async () => {
      const error = "INTERNAL_ERROR"; // shouldAlert: true
      const context = { action: "testAction" };

      handleClientError(error, context);

      // ErrorLogger.logError が呼ばれることを確認
      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "500", // HTTPステータスコードに変換
          title: "INTERNAL_ERROR",
          message: expect.stringContaining("Internal server error"),
          severity: "high",
          category: "client", // デフォルトカテゴリ
        }),
        undefined,
        expect.objectContaining({
          pathname: undefined, // test環境では window なし
          userAgent: expect.any(String), // test環境では Node.js userAgent
        })
      );
    });

    it("shouldAlert: false の場合、ErrorLogger.logError を呼び出さない", () => {
      const error = "VALIDATION_ERROR"; // shouldAlert: false
      const context = { action: "testAction" };

      handleClientError(error, context);

      expect(errorLogger.logError).not.toHaveBeenCalled();
    });

    it("開発環境でコンソールログを出力", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const error = "VALIDATION_ERROR";
      const context = { action: "testAction" };

      handleClientError(error, context);

      expect(consoleSpy).toHaveBeenCalledWith("[ClientError]", {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Input validation failed"),
        severity: "low",
        action: "testAction",
      });

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it("ErrorLogger.logError の失敗をサイレントに処理", async () => {
      const error = "INTERNAL_ERROR";
      const reportError = new Error("Report failed");

      (errorLogger.logError as jest.Mock).mockRejectedValue(reportError);

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      handleClientError(error);

      // 非同期処理を待機
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith("[ClientError] Failed to report error:", reportError);

      consoleSpy.mockRestore();
    });
  });

  describe("re-exported functions", () => {
    it("getErrorDetailsが正しく動作", () => {
      const result = getErrorDetails("VALIDATION_ERROR");
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.userMessage).toBe("入力内容に問題があります。正しい形式で入力してください。");
    });

    it("getUserErrorMessageが正しく動作", () => {
      const result = getUserErrorMessage("NETWORK_ERROR");
      expect(result).toBe("ネットワークエラーが発生しました。インターネット接続をご確認ください。");
    });

    it("isRetryableErrorが正しく動作", () => {
      const retryableError = getErrorDetails("NETWORK_ERROR");
      const nonRetryableError = getErrorDetails("VALIDATION_ERROR");

      expect(isRetryableError(retryableError)).toBe(true);
      expect(isRetryableError(nonRetryableError)).toBe(false);
    });

    it("getErrorSeverityが正しく動作", () => {
      const error = getErrorDetails("ENV_VAR_MISSING");
      expect(getErrorSeverity(error)).toBe("critical");
    });

    it("normalizeToErrorDetailsが正しく動作", () => {
      const result = normalizeToErrorDetails("VALIDATION_ERROR");
      expect(result.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("型変換関数", () => {
    it("HTTPエラーコードが正しく変換される", () => {
      // shouldAlert: true のエラーでテスト
      const testCases = [
        { input: "VALIDATION_ERROR", expected: "400" },
        { input: "UNAUTHORIZED", expected: "401" },
        { input: "FORBIDDEN", expected: "403" },
        { input: "NOT_FOUND", expected: "404" },
        { input: "RESOURCE_CONFLICT", expected: "409" },
        { input: "RATE_LIMITED", expected: "429" },
        { input: "INTERNAL_ERROR", expected: "500" },
        { input: "INTERNAL_SERVER_ERROR", expected: "500" },
        { input: "DATABASE_ERROR", expected: "500" },
      ];

      testCases.forEach(({ input, expected }) => {
        const context = { action: "test" };
        handleClientError(input, context);

        if (getErrorDetails(input).shouldAlert) {
          expect(errorLogger.logError).toHaveBeenCalledWith(
            expect.objectContaining({ code: expected }),
            undefined,
            expect.any(Object)
          );
        }
      });
    });

    it("ビジネスエラーコードが正しく変換される", () => {
      const testCases = [
        { input: "EVENT_ENDED", expected: "EVENT_ENDED" },
        { input: "EVENT_CANCELED", expected: "EVENT_ENDED" },
        { input: "ATTENDANCE_CAPACITY_REACHED", expected: "EVENT_FULL" },
        { input: "REGISTRATION_DEADLINE_PASSED", expected: "REGISTRATION_CLOSED" },
        { input: "DUPLICATE_REGISTRATION", expected: "DUPLICATE_REGISTRATION" },
        { input: "INVALID_TOKEN", expected: "INVALID_INVITE" },
        { input: "TOKEN_NOT_FOUND", expected: "INVALID_INVITE" },
        { input: "TOKEN_EXPIRED", expected: "INVALID_INVITE" },
        { input: "PAYMENT_SESSION_CREATION_FAILED", expected: "PAYMENT_FAILED" },
      ];

      testCases.forEach(({ input, expected }) => {
        const context = { action: "test" };
        handleClientError(input, context);

        if (getErrorDetails(input).shouldAlert) {
          expect(errorLogger.logError).toHaveBeenCalledWith(
            expect.objectContaining({ code: expected }),
            undefined,
            expect.any(Object)
          );
        }
      });
    });

    it("LogCategoryが正しく変換される", () => {
      const testCases = [
        { input: "authentication", expected: "auth" },
        { input: "authorization", expected: "auth" },
        { input: "event_management", expected: "business" },
        { input: "attendance", expected: "business" },
        { input: "payment", expected: "payment" },
        { input: "settlement", expected: "payment" },
        { input: "stripe_webhook", expected: "payment" },
        { input: "stripe_connect", expected: "payment" },
        { input: "email", expected: "server" },
        { input: "export", expected: "business" },
        { input: "security", expected: "security" },
        { input: "system", expected: "server" },
        { input: "client", expected: "client" },
      ];

      testCases.forEach(({ input, expected }) => {
        const context = { category: input as any, action: "test" };
        handleClientError("INTERNAL_ERROR", context); // shouldAlert: true

        expect(errorLogger.logError).toHaveBeenCalledWith(
          expect.objectContaining({ category: expected }),
          undefined,
          expect.any(Object)
        );
      });
    });

    it("未知のカテゴリがunknownに変換される", () => {
      const context = { category: "unknown_category" as any, action: "test" };
      handleClientError("INTERNAL_ERROR", context);

      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({ category: "unknown" }),
        undefined,
        expect.any(Object)
      );
    });

    it("カテゴリ未指定がclientに変換される", () => {
      const context = { action: "test" };
      handleClientError("INTERNAL_ERROR", context);

      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({ category: "client" }),
        undefined,
        expect.any(Object)
      );
    });
  });
});
