/**
 * error-handler.server.ts のユニットテスト
 * サーバー専用機能（Sentry, logger, waitUntil）のテスト
 */

import { jest } from "@jest/globals";
import * as Sentry from "@sentry/cloudflare";

import { AppError } from "../../../../core/errors";

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

import { logger } from "../../../../core/logging/app-logger";
import { sendSlackText } from "../../../../core/notification/slack";
import { waitUntil } from "../../../../core/utils/cloudflare-ctx";
import {
  notifyError,
  logError,
  handleServerError,
} from "../../../../core/utils/error-handler.server";

describe("error-handler.server", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("notifyError", () => {
    it("severity: high (INTERNAL_ERROR) の場合、Sentry に送信", async () => {
      const error = new AppError("INTERNAL_ERROR", {
        message: "Internal server error",
        userMessage: "サーバーエラーが発生しました",
      });
      // AppError("INTERNAL_ERROR") implies severity: high from registry

      const context = {
        action: "testAction",
        userId: "user123",
        additionalData: { key: "value" },
      };

      await notifyError(error, context);

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Internal server error",
        expect.objectContaining({
          level: "error",
          tags: {
            error_code: "INTERNAL_ERROR",
            severity: "high",
            action: "testAction",
          },
          extra: expect.objectContaining({
            userMessage: "サーバーエラーが発生しました",
            userId: "user123",
            eventId: undefined,
            originalError: undefined,
            key: "value",
          }),
        })
      );
    });

    it("severity: critical の場合、Slack にも送信", async () => {
      const error = new AppError("ENV_VAR_MISSING");

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

    it("severity: low の場合、Sentry/Slack送信しない", async () => {
      const error = new AppError("VALIDATION_ERROR", {
        message: "Validation failed",
      });
      // VALIDATION_ERROR is typically low

      await notifyError(error);

      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(sendSlackText).not.toHaveBeenCalled();
    });

    it("context.severity を優先して通知する", async () => {
      const error = new AppError("VALIDATION_ERROR", {
        message: "Validation failed",
      });

      await notifyError(error, { action: "testAction", severity: "critical" });

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Validation failed",
        expect.objectContaining({
          level: "fatal",
          tags: expect.objectContaining({
            severity: "critical",
          }),
        })
      );
      expect(sendSlackText).toHaveBeenCalled();
    });

    it("Sentry 送信失敗時、コンソールにエラーを記録", async () => {
      const error = new AppError("INTERNAL_ERROR");
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
    it("severity: low の場合、logger.warn を使用", () => {
      const error = new AppError("VALIDATION_ERROR", {
        message: "Validation failed",
      });

      const context = {
        action: "validateInput",
        userId: "user123",
        ip: "203.0.113.1",
        userAgent: "unit-test-agent",
      };

      logError(error, context);

      expect(logger.warn).toHaveBeenCalledWith(
        "Validation failed",
        expect.objectContaining({
          category: "event_management", // VALIDATION_ERROR maps to event_management
          error_code: "VALIDATION_ERROR",
          severity: "low",
          ip_address: "203.0.113.1",
          user_agent: "unit-test-agent",
        })
      );
    });

    it("severity: high の場合、logger.error を使用", () => {
      const error = new AppError("INTERNAL_ERROR", {
        message: "Internal error",
      });

      logError(error);

      expect(logger.error).toHaveBeenCalledWith(
        "Internal error",
        expect.objectContaining({
          error_code: "INTERNAL_ERROR",
          severity: "high",
        })
      );
    });

    it("常に notifyError を waitUntil で実行", () => {
      const error = new AppError("VALIDATION_ERROR");

      logError(error);

      expect(waitUntil).toHaveBeenCalled();
    });
  });

  describe("handleServerError", () => {
    it("エラーを正規化してログ記録", () => {
      const error = "VALIDATION_ERROR"; // string error
      const context = {
        action: "testAction",
        userId: "user123",
      };

      const result = handleServerError(error, context);

      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe("VALIDATION_ERROR");

      expect(logger.warn).toHaveBeenCalled();
      expect(waitUntil).toHaveBeenCalled();
    });

    it("context の severity で重要度を上書き（ログ出力時）", () => {
      const error = "VALIDATION_ERROR"; // low
      const context = {
        action: "testAction",
        severity: "critical" as const, // override to critical
      };

      handleServerError(error, context);

      // logError should enable logger.error due to critical override
      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          severity: "critical",
        })
      );
    });
  });
});
