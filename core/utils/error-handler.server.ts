/**
 * EventPay サーバーサイドエラーハンドラー
 * サーバー専用依存（Sentry, logger, waitUntil）を使用
 */

import * as Sentry from "@sentry/cloudflare";

import { AppError, normalizeError } from "@core/errors";
import type { ErrorCategory, ErrorSeverity } from "@core/errors/types";
import { logger, type LogLevel } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { waitUntil } from "@core/utils/cloudflare-ctx";

import type { Database } from "@/types/database";

/** DB enum から型を取得 */
type ActorType = Database["public"]["Enums"]["actor_type_enum"];
type LogOutcome = Database["public"]["Enums"]["log_outcome_enum"];
type LogCategory = Database["public"]["Enums"]["log_category_enum"];

export interface ErrorContext {
  userAgent?: string;
  ip?: string;
  userId?: string;
  eventId?: string;
  action?: string;
  /** アクター種別（操作主体） */
  actorType?: ActorType;
  /** 処理結果 */
  outcome?: LogOutcome;
  /** ログカテゴリ */
  category?: LogCategory;
  /** 重要度の明示的な指定（オプション） */
  severity?: ErrorSeverity;
  additionalData?: Record<string, unknown>;
}

const ERROR_CATEGORY_TO_LOG_CATEGORY: Record<ErrorCategory, LogCategory> = {
  system: "system",
  external: "system",
  auth: "authentication",
  validation: "event_management",
  business: "event_management",
  payment: "payment",
  "not-found": "event_management",
  security: "security",
  unknown: "system",
};

/**
 * ErrorCategory を LogCategory に変換
 */
function resolveLogCategory(category: ErrorCategory | undefined): LogCategory {
  if (!category) return "system";
  return ERROR_CATEGORY_TO_LOG_CATEGORY[category] || "system";
}

/**
 * 通知が必要なエラーをSentry/Slackへ送信
 * @param error エラーオブジェクト（AppError推奨）
 * @param context エラーコンテキスト
 */
export async function notifyError(error: AppError, context?: ErrorContext): Promise<void> {
  const severity = context?.severity ?? error.severity;
  const shouldAlert = severity === "high" || severity === "critical";

  if (!shouldAlert) return;

  const clientMessage =
    typeof context?.additionalData?.clientMessage === "string"
      ? context.additionalData.clientMessage
      : undefined;

  // Sentry へ送信
  try {
    Sentry.captureMessage(error.message, {
      level: severity === "critical" ? "fatal" : "error",
      tags: {
        error_code: error.code,
        severity: severity,
        action: context?.action || "unknown",
      },
      extra: {
        ...(context?.additionalData ?? {}),
        userMessage: error.userMessage,
        userId: context?.userId,
        eventId: context?.eventId,
        ip: context?.ip,
        userAgent: context?.userAgent,
        originalError: error.cause,
      },
    });
  } catch (sentryError) {
    // Sentry 送信失敗はログに記録するが、処理は継続
    // eslint-disable-next-line no-console
    console.error("[notifyError] Sentry send failed:", sentryError);
  }

  // critical レベルは Slack にも即時通知
  if (severity === "critical") {
    const clientMessageText = clientMessage ? `\nClient: ${clientMessage}` : "";
    await sendSlackText(
      `🚨 [CRITICAL] ${error.code}\n${error.message}\nAction: ${
        context?.action || "unknown"
      }${clientMessageText}`
    );
  }
}

/**
 * エラーをログに記録
 * @param error エラーオブジェクト（AppError推奨）
 * @param context エラーコンテキスト
 */
export function logError(error: AppError, context?: ErrorContext): void {
  // ログ処理
  const severity = context?.severity ?? error.severity;
  const logLevel: LogLevel = severity === "high" || severity === "critical" ? "error" : "warn";

  // カテゴリ解決: context優先 -> AppError category -> system
  const logCategory = context?.category ?? resolveLogCategory(error.category);

  const fields = {
    ...(context?.additionalData ?? {}),
    category: logCategory,
    action: context?.action ?? "error_handling",
    // actorType: 呼び出し側から指定可能、デフォルトは "system"
    actor_type: context?.actorType ?? "system",
    error_code: error.code,
    severity: severity,
    user_id: context?.userId,
    event_id: context?.eventId,
    ip_address: context?.ip,
    user_agent: context?.userAgent,
    // outcome: エラーログは基本的に "failure"、呼び出し側から上書き可能
    outcome: context?.outcome ?? "failure",
  } as const;

  if (logLevel === "error") {
    logger.error(error.message, fields);
  } else {
    logger.warn(error.message, fields);
  }

  // 通知処理（severity 判定は notifyError 内で実施）
  waitUntil(notifyError(error, context));
}

/**
 * サーバ側エラーを正規化・ログ・通知する統合ハンドラ
 * @param error 任意のエラーオブジェクト
 * @param context エラーコンテキスト
 * @returns 正規化されたAppError
 */
export function handleServerError(error: unknown, context?: ErrorContext): AppError {
  const appError = normalizeError(error);

  // 重要度の上書きがあれば適用（AppError自体は不変だがContextで扱う）
  // logError/notifyError 側で context.severity を優先する

  logError(appError, context);
  return appError;
}
