import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 管理者権限使用の理由を定義するエナム
 */
export enum AdminReason {
  USER_CLEANUP = "user_cleanup",
  TEST_DATA_SETUP = "test_data_setup",
  SYSTEM_MAINTENANCE = "system_maintenance",
  EMERGENCY_ACCESS = "emergency_access",
  DATA_MIGRATION = "data_migration",
  SECURITY_INVESTIGATION = "security_investigation",
}

/**
 * ゲストトークンエラーコード
 */
export enum GuestErrorCode {
  INVALID_FORMAT = "INVALID_FORMAT",
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  MODIFICATION_NOT_ALLOWED = "MODIFICATION_NOT_ALLOWED",
  EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
}

/**
 * ゲストトークンエラークラス
 */
export class GuestTokenError extends Error {
  constructor(
    public code: GuestErrorCode,
    message: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = "GuestTokenError";
  }
}

/**
 * 管理者アクセスエラーコード
 */
export enum AdminAccessErrorCode {
  UNAUTHORIZED_REASON = "UNAUTHORIZED_REASON",
  MISSING_CONTEXT = "MISSING_CONTEXT",
  AUDIT_LOG_FAILED = "AUDIT_LOG_FAILED",
  EMERGENCY_ACCESS_REQUIRED = "EMERGENCY_ACCESS_REQUIRED",
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
export interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  accessedTables?: string[];
  operationType?: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  additionalInfo?: Record<string, unknown>;
}

/**
 * セキュアSupabaseクライアントのインターフェース
 */
export interface SecureSupabaseClient {
  /**
   * 通常の認証済みクライアントを作成
   */
  createAuthenticatedClient(): SupabaseClient;

  /**
   * ゲストトークン認証クライアントを作成（カスタムヘッダー自動設定）
   * @param token ゲストトークン
   * @returns ゲスト用Supabaseクライアント
   */
  createGuestClient(token: string): SupabaseClient;

  /**
   * 限定的管理者クライアントを作成（監査付き）
   * @param reason 管理者権限使用理由
   * @param context 監査コンテキスト
   * @returns 監査付き管理者クライアント
   */
  createAuditedAdminClient(
    reason: AdminReason,
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient>;

  /**
   * 読み取り専用クライアントを作成
   */
  createReadOnlyClient(): SupabaseClient;

  /**
   * ミドルウェア用クライアントを作成
   * @param request NextRequest
   * @param response NextResponse
   */
  createMiddlewareClient(request: unknown, response: unknown): SupabaseClient;
}

/**
 * ゲストトークンバリデーターのインターフェース
 */
export interface GuestTokenValidator {
  /**
   * ゲストトークンを検証
   * @param token ゲストトークン
   * @returns 検証結果
   */
  validateToken(token: string): Promise<GuestValidationResult>;

  /**
   * ゲストセッションを作成
   * @param token ゲストトークン
   * @returns ゲストセッション
   */
  createGuestSession(token: string): Promise<GuestSession>;

  /**
   * 変更権限をチェック
   * @param token ゲストトークン
   * @returns 変更可能かどうか
   */
  checkModificationPermissions(token: string): Promise<boolean>;
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
  status: string;
}
