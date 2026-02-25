import { GuestErrorCode } from "./guest-token-errors";

/**
 * 管理者権限使用の理由を定義するenum
 */
export enum AdminReason {
  TEST_DATA_SETUP = "test_data_setup",
  TEST_DATA_CLEANUP = "test_data_cleanup",
  SYSTEM_MAINTENANCE = "system_maintenance",
  PAYMENT_PROCESSING = "payment_processing",
  REMINDER_PROCESSING = "reminder_processing",
  NOTIFICATION_PROCESSING = "notification_processing",
  LOGGING = "logging",
  ACCOUNT_DELETION = "account_deletion",
  LINE_LOGIN = "line_login",
  DEMO_SETUP = "demo_setup",
  ERROR_COLLECTION = "error_collection",
}

// エラーハンドリングは専用ファイルから再エクスポート
export { GuestErrorCode, GuestTokenError, GuestTokenErrorFactory } from "./guest-token-errors";

/**
 * 管理者アクセスエラーコード
 */
export enum AdminAccessErrorCode {
  UNAUTHORIZED_REASON = "UNAUTHORIZED_REASON",
  MISSING_CONTEXT = "MISSING_CONTEXT",
  AUDIT_LOG_FAILED = "AUDIT_LOG_FAILED",
}

/**
 * 管理者アクセスエラークラス
 */
export class AdminAccessError extends Error {
  constructor(
    public code: AdminAccessErrorCode,
    message: string,
    public auditContext?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AdminAccessError";
  }
}

/**
 * ゲストセッション情報
 */
export interface GuestSession {
  token: string;
  attendanceId: string;
  eventId: string;
  expiresAt: Date;
  permissions: GuestPermission[];
}

/**
 * ゲストの権限
 */
export enum GuestPermission {
  READ_ATTENDANCE = "read_attendance",
  UPDATE_ATTENDANCE = "update_attendance",
  READ_EVENT = "read_event",
  READ_PAYMENT = "read_payment",
}

/**
 * ゲストトークン検証結果
 */
export interface GuestValidationResult {
  isValid: boolean;
  attendanceId?: string;
  eventId?: string;
  canModify: boolean;
  errorCode?: GuestErrorCode;
  session?: GuestSession;
}

/**
 * 監査コンテキスト
 */
export interface AuditContext extends Record<string, unknown> {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestPath?: string;
  requestMethod?: string;
  guestToken?: string;
  accessedTables?: string[];
  operationType?: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  additionalInfo?: Record<string, unknown>;
}

/**
 * クライアント作成オプション
 */
export interface ClientCreationOptions {
  /**
   * セッション永続化の有無
   */
  persistSession?: boolean;

  /**
   * 自動リフレッシュの有無
   */
  autoRefreshToken?: boolean;

  /**
   * カスタムヘッダー
   */
  headers?: Record<string, string>;

  /**
   * 監査情報
   */
  auditInfo?: AuditContext;
}

/**
 * イベント情報の型定義（Supabaseから取得される形式）
 */
export interface EventInfo {
  id: string;
  date: string; // ISO 8601 文字列
  registration_deadline?: string | null; // ISO 8601 文字列またはnull
  canceled_at?: string | null;
}
