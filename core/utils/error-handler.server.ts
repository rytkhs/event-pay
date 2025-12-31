/**
 * EventPay サーバーサイドエラーハンドラー
 * サーバー専用依存（Sentry, logger, waitUntil）を使用
 */

import * as Sentry from "@sentry/cloudflare";

import { logger, type LogLevel } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { waitUntil } from "@core/utils/cloudflare-ctx";

import { normalizeToErrorDetails, type ErrorDetails, type ErrorContext } from "./error-details";

/**
 * 通知が必要なエラーをSentry/Slackへ送信
 * @param error エラー詳細
 * @param context エラーコンテキスト
 */
export async function notifyError(error: ErrorDetails, context?: ErrorContext): Promise<void> {
  if (!error.shouldAlert) return;

  // Sentry へ送信
  try {
    Sentry.captureMessage(error.message, {
      level: error.severity === "critical" ? "fatal" : "error",
      tags: {
        error_code: error.code,
        severity: error.severity,
        action: context?.action || "unknown",
      },
      extra: {
        userMessage: error.userMessage,
        userId: context?.userId,
        eventId: context?.eventId,
        ...context?.additionalData,
      },
    });
  } catch (sentryError) {
    // Sentry 送信失敗はログに記録するが、処理は継続
    // eslint-disable-next-line no-console
    console.error("[notifyError] Sentry send failed:", sentryError);
  }

  // critical レベルは Slack にも即時通知
  if (error.severity === "critical") {
    await sendSlackText(
      `🚨 [CRITICAL] ${error.code}\n${error.message}\nAction: ${context?.action || "unknown"}`
    );
  }
}

/**
 * エラーをログに記録
 * @param error エラー詳細
 * @param context エラーコンテキスト
 */
export function logError(error: ErrorDetails, context?: ErrorContext): void {
  // ログ処理（shouldLog が true の場合のみ）
  if (error.shouldLog) {
    const logLevel: LogLevel =
      error.severity === "high" || error.severity === "critical" ? "error" : "warn";

    const fields = {
      category: context?.category ?? "system",
      action: context?.action ?? "error_handling",
      // actorType: 呼び出し側から指定可能、デフォルトは "system"
      actor_type: context?.actorType ?? "system",
      error_code: error.code,
      severity: error.severity,
      user_id: context?.userId,
      event_id: context?.eventId,
      // outcome: エラーログは基本的に "failure"、呼び出し側から上書き可能
      outcome: context?.outcome ?? "failure",
      ...context?.additionalData,
    } as const;

    if (logLevel === "error") {
      logger.error(error.message, fields);
    } else {
      logger.warn(error.message, fields);
    }
  }

  // 通知処理（shouldLog とは独立して実行）
  waitUntil(notifyError(error, context));
}

/**
 * サーバ側エラーを正規化・ログ・通知する統合ハンドラ
 * @param error 任意のエラーオブジェクト
 * @param context エラーコンテキスト
 * @returns 正規化されたエラー詳細
 */
export function handleServerError(error: unknown, context?: ErrorContext): ErrorDetails {
  const errorDetails = normalizeToErrorDetails(error);

  // 重要度の上書きがあれば適用
  if (context?.severity) {
    errorDetails.severity = context.severity;
    // 重要度が high 以上に引き上げられた場合は、明示的な指定がない限りアラート対象にする
    if (context.severity === "high" || context.severity === "critical") {
      errorDetails.shouldAlert = true;
    }
  }

  logError(errorDetails, context);
  return errorDetails;
}

// re-export for convenience
export { normalizeToErrorDetails } from "./error-details";
export type { ErrorDetails, ErrorContext } from "./error-details";
