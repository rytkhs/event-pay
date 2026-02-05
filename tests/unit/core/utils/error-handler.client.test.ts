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
  getUserErrorMessage,
  isRetryableError,
  getErrorSeverity,
  normalizeError,
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
      expect(result.severity).toBe("low");
    });

    it("文字列エラーコードを処理", () => {
      const result = handleClientError("VALIDATION_ERROR");

      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.severity).toBe("low");
      expect(result.userMessage).toBe("入力内容に誤りがあります。確認して再度お試しください。");
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
    });

    it("重要度がhigh以上の場合、ErrorLogger.logError を呼び出す", () => {
      const error = "INTERNAL_ERROR"; // severity: high
      const context = { action: "testAction" };

      handleClientError(error, context);

      expect(errorLogger.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "INTERNAL_ERROR",
          title: "INTERNAL_ERROR",
          message: expect.stringContaining("Internal server error"),
          severity: "high",
          category: "system",
        }),
        undefined,
        expect.objectContaining({
          pathname: undefined,
          userAgent: expect.any(String),
        })
      );
    });

    it("重要度がlowの場合、ErrorLogger.logError を呼び出さない", () => {
      const error = "VALIDATION_ERROR";
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
        message: expect.stringContaining("Validation failed"),
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

  describe("utility functions", () => {
    it("getUserErrorMessageが正しく動作", () => {
      const result = getUserErrorMessage("NETWORK_ERROR");
      expect(result).toBe("ネットワーク接続を確認してください。");
    });

    it("isRetryableErrorが正しく動作", () => {
      expect(isRetryableError("NETWORK_ERROR")).toBe(true);
      expect(isRetryableError("VALIDATION_ERROR")).toBe(false);
    });

    it("getErrorSeverityが正しく動作", () => {
      expect(getErrorSeverity("ENV_VAR_MISSING")).toBe("critical");
    });

    it("normalizeErrorが正しく動作", () => {
      const result = normalizeError("VALIDATION_ERROR");
      expect(result.code).toBe("VALIDATION_ERROR");
    });
  });
});
