/**
 * EventPay クライアントサイドエラーハンドラー
 * サーバー専用依存を使用せず、ErrorLogger経由でAPI報告
 */

import { errorLogger } from "@/components/errors/error-logger";

import {
  getErrorDetails,
  normalizeToErrorDetails,
  type ErrorDetails,
  type ErrorContext,
} from "./error-details";

/**
 * ErrorDetailsのコードをErrorLoggerのErrorCodeに変換
 */
function mapToErrorCode(
  code: string
):
  | "400"
  | "401"
  | "403"
  | "404"
  | "409"
  | "422"
  | "429"
  | "500"
  | "502"
  | "503"
  | "504"
  | "EVENT_ENDED"
  | "EVENT_FULL"
  | "REGISTRATION_CLOSED"
  | "DUPLICATE_REGISTRATION"
  | "INVALID_INVITE"
  | "PAYMENT_FAILED"
  | "INSUFFICIENT_BALANCE"
  | "RATE_LIMITED"
  | "MAINTENANCE" {
  // HTTPステータスコードにマッピング
  const httpMapping: Record<
    string,
    "400" | "401" | "403" | "404" | "409" | "422" | "429" | "500" | "502" | "503" | "504"
  > = {
    VALIDATION_ERROR: "400",
    UNAUTHORIZED: "401",
    FORBIDDEN: "403",
    NOT_FOUND: "404",
    RESOURCE_CONFLICT: "409",
    RATE_LIMITED: "429",
    INTERNAL_ERROR: "500",
    INTERNAL_SERVER_ERROR: "500",
    DATABASE_ERROR: "500",
  };

  // ビジネスエラーにマッピング
  const businessMapping: Record<
    string,
    | "EVENT_ENDED"
    | "EVENT_FULL"
    | "REGISTRATION_CLOSED"
    | "DUPLICATE_REGISTRATION"
    | "INVALID_INVITE"
    | "PAYMENT_FAILED"
    | "INSUFFICIENT_BALANCE"
    | "RATE_LIMITED"
    | "MAINTENANCE"
  > = {
    EVENT_ENDED: "EVENT_ENDED",
    EVENT_CANCELED: "EVENT_ENDED",
    ATTENDANCE_CAPACITY_REACHED: "EVENT_FULL",
    REGISTRATION_DEADLINE_PASSED: "REGISTRATION_CLOSED",
    DUPLICATE_REGISTRATION: "DUPLICATE_REGISTRATION",
    INVALID_TOKEN: "INVALID_INVITE",
    TOKEN_NOT_FOUND: "INVALID_INVITE",
    TOKEN_EXPIRED: "INVALID_INVITE",
    PAYMENT_SESSION_CREATION_FAILED: "PAYMENT_FAILED",
  };

  return httpMapping[code] || businessMapping[code] || "500";
}

/**
 * LogCategoryをErrorLoggerのErrorCategoryに変換
 */
function mapToErrorCategory(
  category?: string
):
  | "network"
  | "auth"
  | "validation"
  | "business"
  | "server"
  | "client"
  | "security"
  | "payment"
  | "not-found"
  | "unknown" {
  const mapping: Record<
    string,
    | "network"
    | "auth"
    | "validation"
    | "business"
    | "server"
    | "client"
    | "security"
    | "payment"
    | "not-found"
    | "unknown"
  > = {
    authentication: "auth",
    authorization: "auth",
    event_management: "business",
    attendance: "business",
    payment: "payment",
    settlement: "payment",
    stripe_webhook: "payment",
    stripe_connect: "payment",
    email: "server",
    export: "business",
    security: "security",
    system: "server",
    client: "client",
  };

  return category ? mapping[category] || "unknown" : "client";
}

/**
 * クライアントサイドエラーハンドラー
 *
 * - サーバー専用依存（@sentry/cloudflare, waitUntil）を使用しない
 * - 重要なエラー（shouldAlert: true）は ErrorLogger 経由で /api/errors へ報告
 * - /api/errors でサーバー側が Sentry/Slack に通知
 */
export function handleClientError(error: unknown, context?: ErrorContext): ErrorDetails {
  let errorDetails: ErrorDetails;

  if (error instanceof TypeError && error.message.includes("fetch")) {
    errorDetails = getErrorDetails("NETWORK_ERROR");
  } else if (typeof error === "string") {
    errorDetails = getErrorDetails(error);
  } else if (error && typeof error === "object" && "code" in error) {
    errorDetails = getErrorDetails(error.code as string);
  } else {
    errorDetails = normalizeToErrorDetails(error);
  }

  // 重要度の上書き
  if (context?.severity) {
    errorDetails.severity = context.severity;
    if (context.severity === "high" || context.severity === "critical") {
      errorDetails.shouldAlert = true;
    }
  }

  // 開発環境はコンソールログ
  if (process.env.NODE_ENV === "development") {
    console.error("[ClientError]", {
      code: errorDetails.code,
      message: errorDetails.message,
      severity: errorDetails.severity,
      action: context?.action,
    });
  }

  // 重要なエラーは API 経由でサーバーに報告
  if (errorDetails.shouldAlert) {
    // ErrorLoggerの型に合わせて変換
    const errorCode = mapToErrorCode(errorDetails.code);
    const errorCategory = mapToErrorCategory(context?.category);

    // Fire-and-forget（レスポンスを待たない）
    errorLogger
      .logError(
        {
          code: errorCode,
          title: errorDetails.code,
          message: errorDetails.message,
          severity: errorDetails.severity,
          category: errorCategory,
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

  return errorDetails;
}

// re-export for convenience
export {
  getErrorDetails,
  getUserErrorMessage,
  isRetryableError,
  getErrorSeverity,
  normalizeToErrorDetails,
  type ErrorDetails,
  type ErrorContext,
} from "./error-details";
