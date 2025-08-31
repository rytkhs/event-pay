/**
 * EventPay セキュリティイベントログ記録システム
 * セキュリティ関連のイベントを統一的に記録・監視します
 */

import { logger } from "@/lib/logging/app-logger";

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  details?: Record<string, unknown>;
  userAgent?: string;
  ip?: string;
  timestamp: Date;
  userId?: string;
  eventId?: string;
}

export type SecurityEventType =
  | "XSS_ATTEMPT"
  | "DUPLICATE_REGISTRATION"
  | "RATE_LIMIT_EXCEEDED"
  | "INVALID_TOKEN"
  | "MALICIOUS_INPUT"
  | "CAPACITY_BYPASS_ATTEMPT"
  | "DEADLINE_BYPASS_ATTEMPT"
  | "PAYMENT_METHOD_CHANGE_AFTER_FINALIZED_ATTEMPT"
  | "SANITIZATION_TRIGGERED"
  | "VALIDATION_FAILURE"
  | "SUSPICIOUS_ACTIVITY";

export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * セキュリティイベントをログに記録します
 * @param event セキュリティイベント情報
 */
export function logSecurityEvent(event: SecurityEvent): void {
  const logEntry = {
    timestamp: event.timestamp.toISOString(),
    type: event.type,
    severity: event.severity,
    message: event.message,
    details: event.details,
    userAgent: event.userAgent,
    ip: maskIP(event.ip),
    userId: event.userId,
    eventId: event.eventId,
  };

  // 開発環境では詳細ログを出力
  if (process.env.NODE_ENV === "development") {
    logger.warn(`[SECURITY ${event.severity}] ${event.type}`, {
      tag: "securityEvent",
      security_type: event.type,
      security_severity: event.severity,
      message: event.message,
      user_id: event.userId,
      event_id: event.eventId
    });
  }

  // 本番環境では適切なログシステムに送信
  // TODO: 本番環境では外部ログサービス（CloudWatch、Datadog等）に送信
  if (process.env.NODE_ENV === "production") {
    // 本番環境でのログ記録実装
    // 例: await sendToLogService(logEntry);
  }

  // 重要度が高い場合はアラートを送信
  if (event.severity === "HIGH" || event.severity === "CRITICAL") {
    sendSecurityAlert(logEntry);
  }
}

/**
 * 参加登録関連のセキュリティイベントを記録します
 * @param type イベントタイプ
 * @param message メッセージ
 * @param details 詳細情報
 * @param request リクエスト情報（オプション）
 */
export function logParticipationSecurityEvent(
  type: SecurityEventType,
  message: string,
  details?: Record<string, unknown>,
  request?: {
    userAgent?: string;
    ip?: string;
    eventId?: string;
  }
): void {
  const severity = getSeverityForEventType(type);

  logSecurityEvent({
    type,
    severity,
    message,
    details,
    userAgent: request?.userAgent,
    ip: request?.ip,
    eventId: request?.eventId,
    timestamp: new Date(),
  });
}

/**
 * 入力サニタイゼーションイベントを記録します
 * @param originalInput 元の入力
 * @param sanitizedInput サニタイズ後の入力
 * @param fieldName フィールド名
 * @param request リクエスト情報
 */
export function logSanitizationEvent(
  originalInput: string,
  sanitizedInput: string,
  fieldName: string,
  request?: {
    userAgent?: string;
    ip?: string;
    eventId?: string;
  }
): void {
  // サニタイゼーションが実際に何かを変更した場合のみログ記録
  if (originalInput !== sanitizedInput) {
    const hasScriptTag = originalInput.includes("<script") || originalInput.includes("javascript:");
    const hasHtmlTags = /<[^>]*>/.test(originalInput);

    logParticipationSecurityEvent(
      "SANITIZATION_TRIGGERED",
      `Input sanitization applied to field: ${fieldName}`,
      {
        fieldName,
        originalLength: originalInput.length,
        sanitizedLength: sanitizedInput.length,
        hasScriptTag,
        hasHtmlTags,
        // セキュリティ上、実際の内容は記録しない（長さと特徴のみ）
      },
      request
    );
  }
}


/**
 * バリデーション失敗を記録します
 * @param fieldName フィールド名
 * @param errorMessage エラーメッセージ
 * @param inputValue 入力値（マスク済み）
 * @param request リクエスト情報
 */
export function logValidationFailure(
  fieldName: string,
  errorMessage: string,
  inputValue?: string,
  request?: {
    userAgent?: string;
    ip?: string;
    eventId?: string;
  }
): void {
  logParticipationSecurityEvent(
    "VALIDATION_FAILURE",
    `Validation failed for field: ${fieldName}`,
    {
      fieldName,
      errorMessage,
      inputLength: inputValue?.length,
      // セキュリティ上、実際の値は記録しない
    },
    request
  );
}

/**
 * 不正なトークンアクセスを記録します
 * @param token 不正なトークン（マスク済み）
 * @param tokenType トークンタイプ
 * @param request リクエスト情報
 */
export function logInvalidTokenAccess(
  token: string,
  tokenType: "invite" | "guest",
  request?: {
    userAgent?: string;
    ip?: string;
  }
): void {
  logParticipationSecurityEvent(
    "INVALID_TOKEN",
    `Invalid ${tokenType} token access attempt`,
    {
      tokenType,
      maskedToken: maskToken(token),
    },
    request
  );
}

/**
 * ゲストページで予期しないエラーが発生した際のログ
 * 無効トークンか内部エラーか判別できないケースをこのタグで区別する
 */
export function logUnexpectedGuestPageError(
  token: string,
  error: unknown,
  request?: {
    userAgent?: string;
    ip?: string;
  }
): void {
  logParticipationSecurityEvent(
    "SUSPICIOUS_ACTIVITY",
    "Unexpected error occurred on guest page",
    {
      maskedToken: maskToken(token),
      errorName: error instanceof Error ? error.name : "Unknown",
    },
    request
  );
}

/**
 * イベントタイプに基づいて重要度を決定します
 * @param type イベントタイプ
 * @returns 重要度
 */
function getSeverityForEventType(type: SecurityEventType): SecuritySeverity {
  switch (type) {
    case "XSS_ATTEMPT":
    case "MALICIOUS_INPUT":
      return "HIGH";
    case "DUPLICATE_REGISTRATION":
    case "CAPACITY_BYPASS_ATTEMPT":
    case "DEADLINE_BYPASS_ATTEMPT":
    case "PAYMENT_METHOD_CHANGE_AFTER_FINALIZED_ATTEMPT":
      return "MEDIUM";
    case "RATE_LIMIT_EXCEEDED":
    case "INVALID_TOKEN":
    case "SUSPICIOUS_ACTIVITY":
      return "MEDIUM";
    case "SANITIZATION_TRIGGERED":
    case "VALIDATION_FAILURE":
      return "LOW";
    default:
      return "LOW";
  }
}

/**
 * IPアドレスをマスクします
 * @param ip IPアドレス
 * @returns マスクされたIPアドレス
 */
function maskIP(ip?: string): string | undefined {
  if (!ip) return undefined;

  // IPv4の場合: 192.168.1.xxx
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }

  // IPv6の場合: 最後の部分をマスク
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length > 1) {
      return parts.slice(0, -1).join(":") + ":xxxx";
    }
  }

  return "xxx.xxx.xxx.xxx";
}



/**
 * トークンをマスクします
 * @param token トークン
 * @returns マスクされたトークン
 */
function maskToken(token: string): string {
  if (token.length <= 8) return "***";
  return token.substring(0, 4) + "***" + token.substring(token.length - 4);
}

/**
 * セキュリティアラートを送信します
 * @param logEntry ログエントリ
 */
function sendSecurityAlert(logEntry: Record<string, unknown>): void {
  // 開発環境では警告を出力
  if (process.env.NODE_ENV === "development") {
    logger.error("🚨 SECURITY ALERT", {
      tag: "securityAlert",
      alert_data: logEntry
    });
  }

  // 本番環境では適切なアラートシステムに送信
  // TODO: 本番環境ではSlack、メール、SMS等でアラート送信
  if (process.env.NODE_ENV === "production") {
    // 例: await sendSlackAlert(logEntry);
    // 例: await sendEmailAlert(logEntry);
  }
}
