/**
 * Slack Webhook通知ヘルパー
 * MVP: シンプルなテキスト送信のみサポート
 */

import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import type { NotificationResult } from "@core/notification/types";
import { getEnv } from "@core/utils/cloudflare-env";

type SlackErrorClassification = {
  retryable: boolean;
  errorType: "transient" | "permanent";
};

function classifySlackError(error: unknown): SlackErrorClassification {
  if (!(error instanceof Error)) {
    return { retryable: true, errorType: "transient" };
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("invalid url") ||
    message.includes("failed to parse url") ||
    message.includes("only absolute urls are supported") ||
    message.includes("unsupported protocol")
  ) {
    return { retryable: false, errorType: "permanent" };
  }

  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("etimedout") ||
    message.includes("fetch failed")
  ) {
    return { retryable: true, errorType: "transient" };
  }

  return { retryable: true, errorType: "transient" };
}

/**
 * Slack Webhook経由でメッセージを送信
 * @param text 送信するテキスト（プレーンテキスト）
 * @param webhookUrl Webhook URL（省略時は環境変数から取得）
 */
export async function sendSlackText(
  text: string,
  webhookUrl?: string
): Promise<NotificationResult> {
  const url = webhookUrl || getEnv().SLACK_CONTACT_WEBHOOK_URL;

  // Webhook URLが設定されていない場合はスキップ（正常終了）
  if (!url) {
    logger.debug("Slack webhook URL not configured, skipping notification", {
      category: "system",
      action: "slack_notification",
      actor_type: "system",
      outcome: "success",
    });
    return okResult(undefined, { skipped: true });
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Slack notification failed (${response.status})`, {
        category: "system",
        action: "slack_notification",
        status_code: response.status,
        error_message: errorText,
        outcome: "failure",
      });
      return errResult(
        new AppError("EXTERNAL_SERVICE_ERROR", {
          message: `Slack API returned ${response.status}: ${errorText}`,
          userMessage: "Slack通知の送信に失敗しました",
          retryable: response.status >= 500 || response.status === 429,
          details: {
            statusCode: response.status,
          },
        }),
        {
          statusCode: response.status,
        }
      );
    }

    logger.info("Slack notification sent", {
      category: "system",
      action: "slack_notification",
      actor_type: "system",
      outcome: "success",
    });

    return okResult();
  } catch (error) {
    const classified = classifySlackError(error);
    logger.error("Unexpected error in Slack notification", {
      category: "system",
      action: "slack_notification",
      error_message: error instanceof Error ? error.message : String(error),
      error_type: classified.errorType,
      retryable: classified.retryable,
      outcome: "failure",
    });
    return errResult(
      new AppError("EXTERNAL_SERVICE_ERROR", {
        message: error instanceof Error ? error.message : "Unknown error",
        userMessage: "Slack通知の送信に失敗しました",
        retryable: classified.retryable,
        details: {
          errorType: classified.errorType,
        },
      }),
      {
        errorType: classified.errorType,
      }
    );
  }
}
