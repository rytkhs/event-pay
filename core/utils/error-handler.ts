/**
 * EventPay エラーハンドリングユーティリティ
 * 統一的なエラーハンドリングとユーザーフレンドリーなメッセージ変換
 */

import * as Sentry from "@sentry/cloudflare";

import { logger, type LogLevel } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { waitUntil } from "@core/utils/cloudflare-ctx";

import type { Database } from "@/types/database";

/** DB enum から型を取得 */
type ActorType = Database["public"]["Enums"]["actor_type_enum"];
type LogOutcome = Database["public"]["Enums"]["log_outcome_enum"];

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
  /** アクター種別（操作主体） */
  actorType?: ActorType;
  /** 処理結果 */
  outcome?: LogOutcome;
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

  // 認証系（予期しないエラー - Sentry通知対象）
  REGISTRATION_UNEXPECTED_ERROR: {
    message: "User registration failed unexpectedly",
    userMessage: "登録処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LOGIN_UNEXPECTED_ERROR: {
    message: "Login failed unexpectedly",
    userMessage: "ログイン処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  OTP_UNEXPECTED_ERROR: {
    message: "OTP verification failed unexpectedly",
    userMessage: "確認処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  RESEND_OTP_UNEXPECTED_ERROR: {
    message: "OTP resend failed unexpectedly",
    userMessage: "再送信処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  RESET_PASSWORD_UNEXPECTED_ERROR: {
    message: "Password reset request failed unexpectedly",
    userMessage: "パスワードリセット処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  UPDATE_PASSWORD_UNEXPECTED_ERROR: {
    message: "Password update failed unexpectedly",
    userMessage: "パスワード更新処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LOGOUT_UNEXPECTED_ERROR: {
    message: "Logout failed unexpectedly",
    userMessage: "ログアウト処理中にエラーが発生しました。",
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

  // Stripe Connect関連エラー
  CONNECT_ACCOUNT_NOT_FOUND: {
    message: "Stripe Connect Account not found",
    userMessage:
      "決済の準備ができません。主催者のお支払い受付設定に不備があります。現金決済をご利用いただくか、主催者にお問い合わせください。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  CONNECT_ACCOUNT_RESTRICTED: {
    message: "Stripe Connect Account is restricted",
    userMessage:
      "主催者のお支払い受付が一時的に制限されています。現金決済をご利用いただくか、主催者にお問い合わせください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  STRIPE_CONFIG_ERROR: {
    message: "Stripe configuration error",
    userMessage:
      "決済システムに一時的な問題が発生しています。しばらく時間をおいて再度お試しいただくか、現金決済をご利用ください。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
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
      category: "system",
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
      const problem = (await response.json()) as Record<string, unknown>;
      const code = typeof problem?.code === "string" ? problem.code : "UNKNOWN_ERROR";
      return getErrorDetails(code);
    }

    // 非 Problem Details の JSON でも code や message を尊重
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as Record<string, unknown>;
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

// ============================================================================
// サーバ側統合ハンドラ
// ============================================================================

/**
 * 各種エラーを ErrorDetails に正規化
 * @param error 任意のエラーオブジェクト
 * @returns 正規化されたエラー詳細
 */
export function normalizeToErrorDetails(error: unknown): ErrorDetails {
  // 既知のエラーコード文字列
  if (typeof error === "string") {
    return getErrorDetails(error);
  }

  // code プロパティを持つオブジェクト
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return getErrorDetails(error.code);
  }

  // Supabase AuthError / 一般的なエラーオブジェクト
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message: string }).message;
    if (msg.includes("already registered")) {
      return getErrorDetails("DUPLICATE_REGISTRATION");
    }
    if (msg.includes("rate limit")) {
      return getErrorDetails("RATE_LIMIT_EXCEEDED");
    }
    if (msg.includes("Email not confirmed")) {
      return getErrorDetails("VALIDATION_ERROR");
    }
  }

  // フォールバック
  return getErrorDetails("INTERNAL_SERVER_ERROR");
}

/**
 * サーバ側エラーを正規化・ログ・通知する統合ハンドラ
 * @param error 任意のエラーオブジェクト
 * @param context エラーコンテキスト
 * @returns 正規化されたエラー詳細
 */
export function handleServerError(error: unknown, context?: ErrorContext): ErrorDetails {
  const errorDetails = normalizeToErrorDetails(error);
  logError(errorDetails, context);
  return errorDetails;
}
