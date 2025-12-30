/**
 * error-handler.ts のユニットテスト
 */

import * as Sentry from "@sentry/cloudflare";

import { sendSlackText } from "@core/notification/slack";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import {
  notifyError,
  logError,
  handleServerError,
  normalizeToErrorDetails,
  getErrorDetails,
  type ErrorDetails,
  type ErrorContext,
} from "@core/utils/error-handler";

// モック
jest.mock("@sentry/cloudflare", () => ({
  captureMessage: jest.fn(),
}));

jest.mock("@core/notification/slack", () => ({
  sendSlackText: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@core/utils/cloudflare-ctx", () => ({
  waitUntil: jest.fn((promise) => promise),
}));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("error-handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("notifyError", () => {
    it("shouldAlert: false の場合、Sentry に送信しない", async () => {
      const error: ErrorDetails = {
        code: "TEST_ERROR",
        message: "Test error",
        userMessage: "テストエラー",
        severity: "low",
        shouldLog: true,
        shouldAlert: false,
        retryable: false,
      };

      await notifyError(error);

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(sendSlackText).not.toHaveBeenCalled();
    });

    it("shouldAlert: true の場合、Sentry に送信する", async () => {
      const error: ErrorDetails = {
        code: "TEST_ERROR",
        message: "Test error",
        userMessage: "テストエラー",
        severity: "high",
        shouldLog: true,
        shouldAlert: true,
        retryable: false,
      };

      const context: ErrorContext = {
        action: "testAction",
        userId: "user-123",
      };

      await notifyError(error, context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith("Test error", {
        level: "error",
        tags: {
          error_code: "TEST_ERROR",
          severity: "high",
          action: "testAction",
        },
        extra: {
          userMessage: "テストエラー",
          userId: "user-123",
          eventId: undefined,
        },
      });
      expect(sendSlackText).not.toHaveBeenCalled();
    });

    it("severity: critical の場合、Slack にも送信する", async () => {
      const error: ErrorDetails = {
        code: "CRITICAL_ERROR",
        message: "Critical error",
        userMessage: "致命的エラー",
        severity: "critical",
        shouldLog: true,
        shouldAlert: true,
        retryable: false,
      };

      await notifyError(error, { action: "criticalAction" });

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Critical error",
        expect.objectContaining({
          level: "fatal",
        })
      );
      expect(sendSlackText).toHaveBeenCalledWith(expect.stringContaining("[CRITICAL]"));
    });

    it("Sentry 送信失敗時でもエラーを throw しない", async () => {
      (Sentry.captureMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error("Sentry failed");
      });

      const error: ErrorDetails = {
        code: "TEST_ERROR",
        message: "Test error",
        userMessage: "テストエラー",
        severity: "high",
        shouldLog: true,
        shouldAlert: true,
        retryable: false,
      };

      // エラーが throw されないことを確認
      await expect(notifyError(error)).resolves.not.toThrow();
    });
  });

  describe("logError", () => {
    it("shouldLog: false でも通知は実行される", async () => {
      const error: ErrorDetails = {
        code: "NO_LOG_ERROR",
        message: "No log error",
        userMessage: "ログなしエラー",
        severity: "high",
        shouldLog: false,
        shouldAlert: true,
        retryable: false,
      };

      logError(error, { action: "testAction" });

      // waitUntil が呼ばれていることを確認（通知が実行される）
      expect(waitUntil).toHaveBeenCalled();
    });
  });

  describe("normalizeToErrorDetails", () => {
    it("文字列のエラーコードを正しく解決する", () => {
      const result = normalizeToErrorDetails("INTERNAL_SERVER_ERROR");

      expect(result.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.shouldAlert).toBe(true);
    });

    it("code プロパティを持つオブジェクトを正しく解決する", () => {
      const error = { code: "DATABASE_ERROR", message: "DB failed" };
      const result = normalizeToErrorDetails(error);

      expect(result.code).toBe("DATABASE_ERROR");
    });

    it("already registered メッセージを DUPLICATE_REGISTRATION に変換する", () => {
      const error = { message: "User already registered" };
      const result = normalizeToErrorDetails(error);

      expect(result.code).toBe("DUPLICATE_REGISTRATION");
    });

    it("rate limit メッセージを RATE_LIMIT_EXCEEDED に変換する", () => {
      const error = { message: "rate limit exceeded" };
      const result = normalizeToErrorDetails(error);

      expect(result.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("不明なエラーは INTERNAL_SERVER_ERROR にフォールバックする", () => {
      const result = normalizeToErrorDetails({ unknown: "error" });

      expect(result.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  describe("handleServerError", () => {
    it("エラーコード文字列を受け取り、ログと通知を実行する", () => {
      const result = handleServerError("REGISTRATION_UNEXPECTED_ERROR", {
        action: "testAction",
      });

      expect(result.code).toBe("REGISTRATION_UNEXPECTED_ERROR");
      expect(result.shouldAlert).toBe(true);
      expect(waitUntil).toHaveBeenCalled();
    });
  });

  describe("getErrorDetails", () => {
    it("存在するエラーコードの詳細を返す", () => {
      const result = getErrorDetails("INTERNAL_ERROR");

      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.severity).toBe("high");
      expect(result.shouldAlert).toBe(true);
    });

    it("存在しないエラーコードは UNKNOWN_ERROR を返す", () => {
      const result = getErrorDetails("NON_EXISTENT_CODE");

      expect(result.code).toBe("UNKNOWN_ERROR");
    });
  });
});
