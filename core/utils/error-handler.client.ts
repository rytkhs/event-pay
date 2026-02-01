/**
 * EventPay クライアントサイドエラーハンドラー
 * サーバー専用依存を使用せず、ErrorLogger経由でAPI報告
 */

import { AppError, normalizeError } from "@core/errors";
import type { ErrorSeverity } from "@core/errors/types";

import { errorLogger } from "@/components/errors/error-logger";
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
  /** ログカテゴリ（DB enum） */
  category?: LogCategory;
  /** 重要度の明示的な指定（オプション） */
  severity?: ErrorSeverity;
  additionalData?: Record<string, unknown>;
}

function resolveAppError(error: unknown, context?: ErrorContext): AppError {
  const base = normalizeError(error, "UNKNOWN_ERROR");
  if (!context?.severity) {
    return base;
  }
  return new AppError(base.code, {
    message: base.message,
    userMessage: base.userMessage,
    retryable: base.retryable,
    correlationId: base.correlationId,
    details: base.details,
    severity: context.severity,
    cause: base,
  });
}

function buildReportContext(context?: ErrorContext): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }
  const reportContext: Record<string, unknown> = {};
  if (context.action) {
    reportContext.action = context.action;
  }
  if (context.category) {
    reportContext.logCategory = context.category;
  }
  if (context.eventId) {
    reportContext.eventId = context.eventId;
  }
  if (context.additionalData && Object.keys(context.additionalData).length > 0) {
    reportContext.additionalData = context.additionalData;
  }
  return Object.keys(reportContext).length > 0 ? reportContext : undefined;
}

/**
 * クライアントサイドエラーハンドラー
 *
 * - サーバー専用依存（@sentry/cloudflare, waitUntil）を使用しない
 * - 重要なエラー（high/critical）は ErrorLogger 経由で /api/errors へ報告
 */
export function handleClientError(error: unknown, context?: ErrorContext): AppError {
  const appError = resolveAppError(error, context);
  const severity = appError.severity;
  const shouldAlert = severity === "high" || severity === "critical";

  // 開発環境はコンソールログ
  if (process.env.NODE_ENV === "development") {
    console.error("[ClientError]", {
      code: appError.code,
      message: appError.message,
      severity,
      action: context?.action,
    });
  }

  // 重要なエラーは API 経由でサーバーに報告
  if (shouldAlert) {
    // Fire-and-forget（レスポンスを待たない）
    errorLogger
      .logError(
        {
          code: appError.code,
          title: appError.code,
          message: appError.message,
          userMessage: appError.userMessage,
          severity,
          category: appError.category,
          retryable: appError.retryable,
          correlationId: appError.correlationId,
          context: buildReportContext(context),
        },
        error instanceof Error ? error : undefined,
        {
          userId: context?.userId,
          pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }
      )
      .catch((reportError) => {
        // 報告失敗はサイレントに処理（ユーザー操作に影響しない）
        console.warn("[ClientError] Failed to report error:", reportError);
      });
  }

  return appError;
}

export function getUserErrorMessage(error: unknown): string {
  return normalizeError(error, "UNKNOWN_ERROR").userMessage;
}

export function isRetryableError(error: unknown): boolean {
  return normalizeError(error, "UNKNOWN_ERROR").retryable;
}

export function getErrorSeverity(error: unknown): ErrorSeverity {
  return normalizeError(error, "UNKNOWN_ERROR").severity;
}

export { normalizeError };
export type { AppError } from "@core/errors";
