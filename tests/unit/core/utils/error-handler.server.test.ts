/**
 * error-handler.server.ts のユニットテスト
 * サーバー専用機能（Senty, logger, waitUntil）のテスト
 */

import { jest } from "@jest/globals";

jest.mock("@sentry/cloudflare", () => ({
  captureMessage: jest.fn(),
}));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@core/notification/slack", () => ({
  sendSlackText: jest.fn(),
}));

jest.mock("@core/utils/cloudflare-ctx", () => ({
  waitUntil: jest.fn((fn: Promise<void>) => {
    fn.catch(() => {}); // Promiseのエラーを無視
  }),
}));

import * as Sentry from "@sentry/cloudflare";

import { logger } from "../../../../core/logging/app-logger";
import { sendSlackText } from "../../../../core/notification/slack";
import { waitUntil } from "../../../../core/utils/cloudflare-ctx";
import {
  notifyError,
  logError,
  handleServerError,
  type ErrorDetails,
} from "../../../../core/utils/error-handler.server";

describe("error-handler.server", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("notifyError", () => {
    it("shouldAlert: true の場合、Sentry に送信", async () => {
      const error: ErrorDetails = {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        userMessage: "サーバーエラーが発生しました",
        severity: "high",
        shouldLog: true,
        shouldAlert: true,
        retryable: true,
      };

      const context = {
        action: "testAction",
        userId: "user123",
        additionalData: { key: "value" },
      };

      await notifyError(error, context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith("Internal server error", {
        level: "error",
        tags: {
          error_code: "INTERNAL_ERROR",
          severity: "high",
          action: "testAction",
        },
        extra: {
          userMessage: "サーバーエラーが発生しました",
          userId: "user123",
          eventId: undefined,
          key: "value",
        },
      });
    });

    it("severity: critical の場合、Slack にも送信", async () => {
      const error: ErrorDetails = {
        code: "ENV_VAR_MISSING",
        message: "Required environment variable is missing",
        userMessage: "システム設定エラーが発生しました",
        severity: "critical",
        shouldLog: true,
        shouldAlert: true,
        retryable: false,
      };

      const context = { action: "startup" };

      await notifyError(error, context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Required environment variable is missing",
        expect.objectContaining({ level: "fatal" })
      );

      expect(sendSlackText).toHaveBeenCalledWith(
        "🚨 [CRITICAL] ENV_VAR_MISSING\nRequired environment variable is missing\nAction: startup"
      );
    });

    it("shouldAlert: false の場合、何もしない", async () => {
      const error: ErrorDetails = {
        code: "VALIDATION_ERROR",
        message: "Input validation failed",
        userMessage: "入力内容に問題があります",
        severity: "low",
        shouldLog: true,
        shouldAlert: false,
        retryable: false,
      };

      await notifyError(error);

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(sendSlackText).not.toHaveBeenCalled();
    });

    it("Sentry 送信失敗時、コンソールにエラーを記録", async () => {
      const error: ErrorDetails = {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        userMessage: "サーバーエラーが発生しました",
        severity: "high",
        shouldLog: true,
        shouldAlert: true,
        retryable: true,
      };

      const sentryError = new Error("Sentry failed");
      (Sentry.captureMessage as jest.Mock).mockImplementationOnce(() => {
        throw sentryError;
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await notifyError(error);

      expect(consoleSpy).toHaveBeenCalledWith("[notifyError] Sentry send failed:", sentryError);

      consoleSpy.mockRestore();
    });
  });

  describe("logError", () => {
    it("shouldLog: true の場合、logger に記録", () => {
      const error: ErrorDetails = {
        code: "VALIDATION_ERROR",
        message: "Input validation failed",
        userMessage: "入力内容に問題があります",
        severity: "low",
        shouldLog: true,
        shouldAlert: false,
        retryable: false,
      };

      const context = {
        action: "validateInput",
        userId: "user123",
        category: "validation" as const,
      };

      logError(error, context);

      expect(logger.warn).toHaveBeenCalledWith("Input validation failed", {
        category: "validation",
        action: "validateInput",
        actor_type: "system",
        error_code: "VALIDATION_ERROR",
        severity: "low",
        user_id: "user123",
        event_id: undefined,
        outcome: "failure",
      });
    });

    it("severity: high の場合、logger.error を使用", () => {
      const error: ErrorDetails = {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        userMessage: "サーバーエラーが発生しました",
        severity: "high",
        shouldLog: true,
        shouldAlert: true,
        retryable: true,
      };

      logError(error);

      expect(logger.error).toHaveBeenCalledWith(
        "Internal server error",
        expect.objectContaining({
          error_code: "INTERNAL_ERROR",
          severity: "high",
        })
      );
    });

    it("shouldLog: false の場合、ログに記録しない", () => {
      const error: ErrorDetails = {
        code: "EVENT_CANCELED",
        message: "Event has been canceled",
        userMessage: "このイベントはキャンセルされました",
        severity: "low",
        shouldLog: false,
        shouldAlert: false,
        retryable: false,
      };

      logError(error);

      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("常に notifyError を waitUntil で実行", () => {
      const error: ErrorDetails = {
        code: "VALIDATION_ERROR",
        message: "Input validation failed",
        userMessage: "入力内容に問題があります",
        severity: "low",
        shouldLog: true,
        shouldAlert: false,
        retryable: false,
      };

      logError(error);

      expect(waitUntil).toHaveBeenCalled();
    });
  });

  describe("handleServerError", () => {
    it("エラーを正規化してログ記録", () => {
      const error = "VALIDATION_ERROR";
      const context = {
        action: "testAction",
        userId: "user123",
      };

      const result = handleServerError(error, context);

      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.shouldLog).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
      expect(waitUntil).toHaveBeenCalled();
    });

    it("context の severity で重要度を上書き", () => {
      const error = "VALIDATION_ERROR"; // 元は low severity
      const context = {
        action: "testAction",
        severity: "critical" as const,
      };

      const result = handleServerError(error, context);

      expect(result.severity).toBe("critical");
      expect(result.shouldAlert).toBe(true); // high/critical で自動的に true
    });

    it("severity: high で shouldAlert を自動設定", () => {
      const error = "VALIDATION_ERROR"; // 元は shouldAlert: false
      const context = {
        action: "testAction",
        severity: "high" as const,
      };

      const result = handleServerError(error, context);

      expect(result.shouldAlert).toBe(true);
    });

    it("severity: critical で shouldAlert を自動設定", () => {
      const error = "VALIDATION_ERROR"; // 元は shouldAlert: false
      const context = {
        action: "testAction",
        severity: "critical" as const,
      };

      const result = handleServerError(error, context);

      expect(result.shouldAlert).toBe(true);
    });

    it("context なしでも動作", () => {
      const error = "VALIDATION_ERROR";

      const result = handleServerError(error);

      expect(result.code).toBe("VALIDATION_ERROR");
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
