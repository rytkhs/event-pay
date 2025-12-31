/**
 * Slack Webhook通知ヘルパー
 * MVP: シンプルなテキスト送信のみサポート
 */

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

/**
 * Slack Webhook経由でメッセージを送信
 * @param text 送信するテキスト（プレーンテキスト）
 * @param webhookUrl Webhook URL（省略時は環境変数から取得）
 */
export async function sendSlackText(
  text: string,
  webhookUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const url = webhookUrl || getEnv().SLACK_CONTACT_WEBHOOK_URL;

  // Webhook URLが設定されていない場合はスキップ（正常終了）
  if (!url) {
    logger.debug("Slack webhook URL not configured, skipping notification", {
      category: "system",
      action: "slack_notification",
      actor_type: "system",
      outcome: "success",
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
      logger.error(`Slack notification failed (${response.status})`, {
        category: "system",
        action: "slack_notification",
        status_code: response.status,
        error_message: errorText,
        outcome: "failure",
      });
      return {
        success: false,
        error: `Slack API returned ${response.status}: ${errorText}`,
      };
    }

    logger.info("Slack notification sent", {
      category: "system",
      action: "slack_notification",
      actor_type: "system",
      outcome: "success",
    });

    return { success: true };
  } catch (error) {
    logger.error("Unexpected error in Slack notification", {
      category: "system",
      action: "slack_notification",
      error_message: error instanceof Error ? error.message : String(error),
      outcome: "failure",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
