/**
 * Slack Webhook通知ヘルパー
 * MVP: シンプルなテキスト送信のみサポート
 */

import { logger } from "@core/logging/app-logger";

/**
 * Slack Webhook経由でメッセージを送信
 * @param text 送信するテキスト（プレーンテキスト）
 * @param webhookUrl Webhook URL（省略時は環境変数から取得）
 */
export async function sendSlackText(
  text: string,
  webhookUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const url = webhookUrl || process.env.SLACK_CONTACT_WEBHOOK_URL;

  // Webhook URLが設定されていない場合はスキップ（正常終了）
  if (!url) {
    logger.debug("Slack webhook URL not configured, skipping notification", {
      tag: "slack_notification",
    });
    return { success: true };
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
      logger.warn("Slack notification failed", {
        tag: "slack_notification",
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: `Slack API returned ${response.status}: ${errorText}`,
      };
    }

    logger.info("Slack notification sent", {
      tag: "slack_notification",
    });

    return { success: true };
  } catch (error) {
    logger.error("Slack notification error", {
      tag: "slack_notification",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
