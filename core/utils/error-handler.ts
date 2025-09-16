/**
 * EventPay エラーハンドリングユーティリティ
 * 統一的なエラーハンドリングとユーザーフレンドリーなメッセージ変換
 */

import { logger, type LogLevel } from "@core/logging/app-logger";
import { logSecurityEvent, type SecurityEventType } from "@core/security/security-logger";

export interface ErrorDetails {
  code: string;
  message: string;
  userMessage: string;
  severity: "low" | "medium" | "high" | "critical";
  shouldLog: boolean;
  shouldAlert: boolean;
  retryable: boolean;
}

export interface ErrorContext {
  userAgent?: string;
  ip?: string;
  userId?: string;
  eventId?: string;
  action?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * エラーコードとユーザーメッセージのマッピング
 */
const ERROR_MAPPINGS: Record<string, Omit<ErrorDetails, "code">> = {
  // 招待トークン関連エラー
  INVALID_TOKEN: {
    message: "Invalid invite token provided",
    userMessage: "無効な招待リンクです。正しいリンクをご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  TOKEN_NOT_FOUND: {
    message: "Invite token not found in database",
    userMessage: "招待リンクが見つかりません。リンクが正しいかご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  TOKEN_EXPIRED: {
    message: "Invite token has expired",
    userMessage: "招待リンクの有効期限が切れています。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  INVITE_TOKEN_INVALID: {
    message: "Invalid invite token provided",
    userMessage: "無効な招待リンクです。正しいリンクをご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  INVITE_TOKEN_NOT_FOUND: {
    message: "Invite token not found in database",
    userMessage: "招待リンクが見つかりません。リンクが正しいかご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },

  // イベント関連エラー
  EVENT_NOT_FOUND: {
    message: "Event not found",
    userMessage: "イベントが見つかりません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  EVENT_CANCELED: {
    message: "Event has been canceled",
    userMessage: "このイベントはキャンセルされました。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },
  EVENT_ENDED: {
    message: "Event has already ended",
    userMessage: "このイベントは既に終了しています。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },
  REGISTRATION_DEADLINE_PASSED: {
    message: "Registration deadline has passed",
    userMessage: "参加申込期限が過ぎています。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },

  // 参加状況更新/登録時の定員超過（操作失敗）
  ATTENDANCE_CAPACITY_REACHED: {
    message: "Attendance update blocked due to capacity reached",
    userMessage: "イベントの定員に達しているため参加できません。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },

  // 参加登録関連エラー
  DUPLICATE_REGISTRATION: {
    message: "Duplicate registration attempt",
    userMessage: "このメールアドレスは既に登録されています。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  VALIDATION_ERROR: {
    message: "Input validation failed",
    userMessage: "入力内容に問題があります。正しい形式で入力してください。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  INVALID_JSON: {
    message: "Invalid JSON in request body",
    userMessage: "リクエストの形式が正しくありません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },

  // API Problem Details 対応エラーコードの補完
  UNAUTHORIZED: {
    message: "Unauthorized access",
    userMessage: "認証が必要です。ログインしてから再度お試しください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  FORBIDDEN: {
    message: "Forbidden",
    userMessage: "このリソースにアクセスする権限がありません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  NOT_FOUND: {
    message: "Resource not found",
    userMessage: "指定されたリソースが見つかりません。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },
  RESOURCE_CONFLICT: {
    message: "Resource conflict",
    userMessage: "リソースの競合が発生しました。しばらくしてから再度お試しください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  RATE_LIMITED: {
    message: "Rate limit exceeded",
    userMessage: "リクエストが多すぎます。しばらく待ってから再度お試しください。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: "Internal server error",
    userMessage: "内部エラーが発生しました。しばらく時間をおいて再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // システムエラー
  DATABASE_ERROR: {
    message: "Database operation failed",
    userMessage: "データベースエラーが発生しました。しばらく時間をおいて再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  INTERNAL_SERVER_ERROR: {
    message: "Internal server error occurred",
    userMessage: "サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  NETWORK_ERROR: {
    message: "Network connection failed",
    userMessage: "ネットワークエラーが発生しました。インターネット接続をご確認ください。",
    severity: "medium",
    shouldLog: false,
    shouldAlert: false,
    retryable: true,
  },

  // セキュリティ関連エラー
  RATE_LIMIT_EXCEEDED: {
    message: "Rate limit exceeded",
    userMessage: "アクセス頻度が高すぎます。しばらく時間をおいて再度お試しください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  SUSPICIOUS_ACTIVITY: {
    message: "Suspicious activity detected",
    userMessage: "不正なアクセスが検出されました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  XSS_ATTEMPT: {
    message: "XSS attempt detected",
    userMessage: "不正な入力が検出されました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },

  // ゲストトークン関連エラー
  INVALID_GUEST_TOKEN: {
    message: "Invalid guest token provided",
    userMessage: "無効なアクセスです。正しいリンクをご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  GUEST_TOKEN_EXPIRED: {
    message: "Guest token has expired",
    userMessage: "アクセストークンの有効期限が切れています。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  GUEST_TOKEN_VALIDATION_FAILED: {
    message: "Guest token validation failed",
    userMessage: "参加データの取得中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  // 決済セッション作成失敗（ゲスト・主催者の区別なく共通利用）
  PAYMENT_SESSION_CREATION_FAILED: {
    message: "Payment session creation failed",
    userMessage: "決済セッションの作成に失敗しました。しばらくしてから再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
};

/**
 * エラーコードからエラー詳細を取得
 * @param code エラーコード
 * @returns エラー詳細
 */
export function getErrorDetails(code: string): ErrorDetails {
  const mapping = ERROR_MAPPINGS[code];
  if (!mapping) {
    return {
      code: "UNKNOWN_ERROR",
      message: `Unknown error code: ${code}`,
      userMessage: "予期しないエラーが発生しました。",
      severity: "medium",
      shouldLog: true,
      shouldAlert: false,
      retryable: true,
    };
  }

  return {
    code,
    ...mapping,
  };
}

/**
 * エラーをログに記録
 * @param error エラー詳細
 * @param context エラーコンテキスト
 */
export function logError(error: ErrorDetails, context?: ErrorContext): void {
  if (!error.shouldLog) return;

  // セキュリティ関連エラーの場合はセキュリティログに記録
  const securityEventTypes: Record<string, SecurityEventType> = {
    SUSPICIOUS_ACTIVITY: "SUSPICIOUS_ACTIVITY",
    XSS_ATTEMPT: "XSS_ATTEMPT",
    RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
    INVALID_TOKEN: "INVALID_TOKEN",
    INVALID_GUEST_TOKEN: "INVALID_TOKEN",
    DUPLICATE_REGISTRATION: "DUPLICATE_REGISTRATION",
    VALIDATION_ERROR: "VALIDATION_FAILURE",
  };

  const securityEventType = securityEventTypes[error.code];
  if (securityEventType) {
    logSecurityEvent({
      type: securityEventType,
      severity: error.severity.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      message: error.message,
      details: {
        code: error.code,
        action: context?.action,
        ...context?.additionalData,
      },
      userAgent: context?.userAgent,
      ip: context?.ip,
      userId: context?.userId,
      eventId: context?.eventId,
      timestamp: new Date(),
    });
  } else {
    // 一般的なエラーログ
    const logLevel: LogLevel =
      error.severity === "high" || error.severity === "critical" ? "error" : "warn";

    // ログレベルに応じたログ出力
    if (logLevel === "error") {
      logger.error(error.message, {
        tag: "errorHandler",
        error_code: error.code,
        severity: error.severity,
        user_id: context?.userId,
        event_id: context?.eventId,
        action: context?.action,
        ...context?.additionalData,
      });
    } else {
      logger.warn(error.message, {
        tag: "errorHandler",
        error_code: error.code,
        severity: error.severity,
        user_id: context?.userId,
        event_id: context?.eventId,
        action: context?.action,
        ...context?.additionalData,
      });
    }
  }
}

/**
 * エラーからユーザーフレンドリーなメッセージを取得
 * @param error エラーオブジェクト
 * @param fallbackMessage フォールバックメッセージ
 * @returns ユーザーメッセージ
 */
export function getUserErrorMessage(
  error: unknown,
  fallbackMessage = "エラーが発生しました"
): string {
  if (typeof error === "string") {
    const details = getErrorDetails(error);
    return details.userMessage;
  }

  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const details = getErrorDetails(error.code);
    return details.userMessage;
  }

  if (error instanceof Error) {
    // 開発環境では詳細なエラーメッセージを表示
    if (process.env.NODE_ENV === "development") {
      return error.message;
    }
  }

  return fallbackMessage;
}

/**
 * APIエラーレスポンスを処理
 * @param response Fetch Response
 * @returns エラー詳細
 */
export async function handleApiError(response: Response): Promise<ErrorDetails> {
  // Problem Details 優先でエラーコードを判定
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/problem+json")) {
      const problem = await response.json();
      const code = typeof problem?.code === "string" ? problem.code : "UNKNOWN_ERROR";
      return getErrorDetails(code);
    }

    // 非 Problem Details の JSON でも code や message を尊重
    if (contentType.includes("application/json")) {
      const body = await response.json();
      const code = typeof body?.code === "string" ? body.code : undefined;
      if (code) return getErrorDetails(code);
    }
  } catch {
    // 何もしない（後段でHTTPステータスから推測）
  }

  // フォールバック: HTTP ステータスから推測
  let fallback = "UNKNOWN_ERROR";
  switch (response.status) {
    case 400:
      fallback = "VALIDATION_ERROR";
      break;
    case 401:
      fallback = "UNAUTHORIZED";
      break;
    case 403:
      fallback = "FORBIDDEN";
      break;
    case 404:
      fallback = "NOT_FOUND";
      break;
    case 409:
      fallback = "RESOURCE_CONFLICT";
      break;
    case 410:
      fallback = "EVENT_ENDED"; // 代表的な410を便宜的にマップ（UI側で適宜上書き可）
      break;
    case 422:
      fallback = "VALIDATION_ERROR";
      break;
    case 429:
      fallback = "RATE_LIMITED";
      break;
    case 500:
      fallback = "INTERNAL_ERROR";
      break;
  }
  return getErrorDetails(fallback);
}

/**
 * クライアントサイドエラーハンドラー
 * @param error エラー
 * @param context エラーコンテキスト
 * @returns 処理されたエラー詳細
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
    errorDetails = getErrorDetails("UNKNOWN_ERROR");
  }

  // エラーをログに記録
  logError(errorDetails, context);

  return errorDetails;
}

/**
 * エラーが再試行可能かどうかを判定
 * @param error エラー詳細
 * @returns 再試行可能かどうか
 */
export function isRetryableError(error: ErrorDetails): boolean {
  return error.retryable;
}

/**
 * エラーの重要度を取得
 * @param error エラー詳細
 * @returns 重要度
 */
export function getErrorSeverity(error: ErrorDetails): "low" | "medium" | "high" | "critical" {
  return error.severity;
}
