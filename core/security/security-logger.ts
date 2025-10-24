/**
 * EventPay セキュリティイベントログ記録システム
 * セキュリティ関連のイベントを統一的に記録・監視します
 */

import { getMaliciousPatternDetails } from "@core/constants/security-patterns";
import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";
// Import mask functions for re-export (used by external modules)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { maskSessionId, maskPaymentId } from "@core/utils/mask";

export interface SecurityEvent {
  type: SecurityEventType | string;
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
  | "CAPACITY_RACE_CONDITION"
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
  const maskedIp = maskIP(event.ip);
  const logFields = {
    // 統一タグ・セキュリティフィールド
    tag: "securityEvent",
    security_type: event.type,
    security_severity: event.severity,
    message: event.message,
    user_id: event.userId,
    event_id: event.eventId,
    user_agent: event.userAgent,
    ip: maskedIp,
    // 標準化フィールド（ECS/OTel 互換）
    event_category: "security",
    event_action: typeof event.type === "string" ? String(event.type) : "security_event",
    // 必要に応じて outcome を呼び出し側で追加
    timestamp: event.timestamp.toISOString(),
    details: event.details,
  } as Record<string, unknown>;

  // 重要度に応じてログレベルを選択
  const level = ((): "info" | "warn" | "error" => {
    switch (event.severity) {
      case "LOW":
        return "info";
      case "MEDIUM":
        return "warn";
      case "HIGH":
      case "CRITICAL":
        return "error";
      default:
        return "info";
    }
  })();

  const logMessage = event.message || `Security event: ${event.type}`;
  if (level === "info") logger.info(logMessage, logFields);
  else if (level === "warn") logger.warn(logMessage, logFields);
  else logger.error(logMessage, logFields);

  // 重要度が高い場合はアラートを送信（fire-and-forget方式）
  if (event.severity === "HIGH" || event.severity === "CRITICAL") {
    // 非同期処理をバックグラウンドで実行（呼び出し側をブロックしない）
    sendSecurityAlert({
      ...logFields,
    }).catch((error) => {
      // アラート送信の失敗は致命的ではないため、エラーログのみ記録
      console.error("[SecurityAlert] Unhandled error in sendSecurityAlert:", error);
    });
  }
}

/**
 * Webhook用のセキュリティイベント簡易ロガー
 */
export function logWebhookSecurityEvent(
  type: string,
  message: string,
  details?: Record<string, unknown>,
  request?: { userAgent?: string; ip?: string; eventId?: string },
  severity: SecuritySeverity = "LOW"
): void {
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
 * QStash用のセキュリティイベント簡易ロガー
 */
export function logQstashSecurityEvent(
  type: string,
  message: string,
  details?: Record<string, unknown>,
  request?: { userAgent?: string; ip?: string; eventId?: string },
  severity: SecuritySeverity = "LOW"
): void {
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
    // 悪意パターンの詳細な検査を実行
    const maliciousPatternResult = getMaliciousPatternDetails(originalInput);
    const hasHtmlTags = /<[^>]*>/.test(originalInput);

    logParticipationSecurityEvent(
      "SANITIZATION_TRIGGERED",
      `Input sanitization applied to field: ${fieldName}`,
      {
        fieldName,
        originalLength: originalInput.length,
        sanitizedLength: sanitizedInput.length,
        hasMaliciousPattern: maliciousPatternResult.hasPattern,
        detectedPatterns: maliciousPatternResult.detectedPatterns,
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
 * 一般的なトークンをマスクします（従来形式）
 * @param token トークン
 * @returns マスクされたトークン
 * @deprecated 新しいコードでは @core/utils/mask の maskSessionId, maskPaymentId を使用してください
 */
function maskToken(token: string): string {
  if (token.length <= 8) return "***";
  return token.substring(0, 4) + "***" + token.substring(token.length - 4);
}

/**
 * セキュリティログ用の統一マスク関数をエクスポート
 * 外部から利用可能にする
 */
export { maskSessionId, maskPaymentId } from "@core/utils/mask";

/**
 * セキュリティアラートを送信します（非同期）
 * @param logEntry ログエントリ
 */
async function sendSecurityAlert(logEntry: Record<string, unknown>): Promise<void> {
  // 開発環境では警告を出力
  const env = getEnv();
  if (env.NODE_ENV === "development") {
    logger.error("🚨 SECURITY ALERT", {
      tag: "securityAlert",
      alert_data: logEntry,
    });
  }

  // 本番環境では管理者にメールアラートを送信
  if (env.NODE_ENV === "production") {
    try {
      // Dynamic importでメール送信サービスを読み込み
      const { EmailNotificationService } = await import("@core/notification/email-service");
      const emailService = new EmailNotificationService();

      // セキュリティアラートのサマリーを作成
      const securityType = String(logEntry.security_type || "UNKNOWN");
      const severity = String(logEntry.security_severity || "UNKNOWN");
      const message = String(logEntry.message || "Security event detected");

      // アラートメールを送信（失敗してもアプリケーションは停止しない）
      await emailService.sendAdminAlert({
        subject: `🚨 Security Alert [${severity}]: ${securityType}`,
        message: message,
        details: {
          ...logEntry,
          // タイムスタンプを読みやすい形式に変換
          alert_time: new Date().toISOString(),
        },
      });
    } catch (error) {
      // アラート送信失敗をログに記録（循環参照を避けるためconsole.error使用）
      console.error("[SecurityAlert] Failed to send security alert email:", {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        security_type: logEntry.security_type,
      });
    }
  }
}
