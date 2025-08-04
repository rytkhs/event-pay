// セキュリティ監査システムの型定義

// 管理者権限使用理由
export enum AdminReason {
  USER_CLEANUP = 'user_cleanup',
  TEST_DATA_SETUP = 'test_data_setup',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  EMERGENCY_ACCESS = 'emergency_access',
  DATA_MIGRATION = 'data_migration',
  SECURITY_INVESTIGATION = 'security_investigation'
}

// 疑わしい活動の種類
export enum SuspiciousActivityType {
  EMPTY_RESULT_SET = 'EMPTY_RESULT_SET',
  ADMIN_ACCESS_ATTEMPT = 'ADMIN_ACCESS_ATTEMPT',
  INVALID_TOKEN_PATTERN = 'INVALID_TOKEN_PATTERN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_RLS_BYPASS = 'UNAUTHORIZED_RLS_BYPASS',
  BULK_DATA_ACCESS = 'BULK_DATA_ACCESS',
  UNUSUAL_ACCESS_PATTERN = 'UNUSUAL_ACCESS_PATTERN'
}

// セキュリティレベル
export enum SecuritySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// ゲストエラーコード
export enum GuestErrorCode {
  INVALID_FORMAT = 'INVALID_FORMAT',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  MODIFICATION_NOT_ALLOWED = 'MODIFICATION_NOT_ALLOWED',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

// 管理者アクセス監査ログ
export interface AdminAccessAuditLog {
  id?: string;
  userId?: string;
  reason: AdminReason;
  context: string;
  operationDetails?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  accessedTables?: string[];
  sessionId?: string;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  createdAt?: Date;
}

// ゲストアクセス監査ログ
export interface GuestAccessAuditLog {
  id?: string;
  guestTokenHash: string;
  attendanceId?: string;
  eventId?: string;
  action: string;
  tableName?: string;
  operationType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  success: boolean;
  resultCount?: number;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt?: Date;
}

// 疑わしい活動ログ
export interface SuspiciousActivity {
  id?: string;
  activityType: SuspiciousActivityType;
  tableName?: string;
  userRole?: string;
  userId?: string;
  attemptedAction?: string;
  expectedResultCount?: number;
  actualResultCount?: number;
  context?: Record<string, any>;
  severity?: SecuritySeverity;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  detectionMethod?: string;
  falsePositive?: boolean;
  investigatedAt?: Date;
  investigatedBy?: string;
  investigationNotes?: string;
  createdAt?: Date;
}

// 不正アクセス試行ログ
export interface UnauthorizedAccessContext {
  id?: string;
  attemptedResource: string;
  requiredPermission?: string;
  userContext?: Record<string, any>;
  userId?: string;
  guestTokenHash?: string;
  detectionMethod: 'EMPTY_RESULT' | 'PERMISSION_CHECK' | 'RATE_LIMIT' | 'RLS_POLICY';
  blockedByRls?: boolean;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestPath?: string;
  requestMethod?: string;
  requestHeaders?: Record<string, any>;
  responseStatus?: number;
  createdAt?: Date;
}

// セキュリティレポート
export interface SecurityReport {
  timeRange: TimeRange;
  adminAccessCount: number;
  guestAccessCount: number;
  suspiciousActivities: SuspiciousActivity[];
  unauthorizedAttempts: UnauthorizedAccessContext[];
  topFailedActions: Array<{
    action: string;
    count: number;
  }>;
  topSuspiciousIPs: Array<{
    ipAddress: string;
    count: number;
    severity: SecuritySeverity;
  }>;
  rlsViolationIndicators: Array<{
    tableName: string;
    emptyResultCount: number;
    suspicionLevel: SecuritySeverity;
  }>;
}

// 時間範囲
export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

// ゲストトークンエラー
export class GuestTokenError extends Error {
  constructor(
    public code: GuestErrorCode,
    message: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'GuestTokenError';
  }
}

// 管理者権限エラー
export enum AdminAccessErrorCode {
  UNAUTHORIZED_REASON = 'UNAUTHORIZED_REASON',
  MISSING_CONTEXT = 'MISSING_CONTEXT',
  AUDIT_LOG_FAILED = 'AUDIT_LOG_FAILED',
  EMERGENCY_ACCESS_REQUIRED = 'EMERGENCY_ACCESS_REQUIRED'
}

export interface AuditContext {
  operation: string;
  tableName?: string;
  recordId?: string;
  additionalInfo?: Record<string, any>;
}

export class AdminAccessError extends Error {
  constructor(
    public code: AdminAccessErrorCode,
    message: string,
    public auditContext?: AuditContext
  ) {
    super(message);
    this.name = 'AdminAccessError';
  }
}

// セキュリティ監査インターフェース
export interface SecurityAuditor {
  logAdminAccess(log: AdminAccessAuditLog): Promise<void>;
  logGuestAccess(log: GuestAccessAuditLog): Promise<void>;
  logSuspiciousActivity(activity: SuspiciousActivity): Promise<void>;
  logUnauthorizedAccess(context: UnauthorizedAccessContext): Promise<void>;
  generateSecurityReport(timeRange: TimeRange): Promise<SecurityReport>;
  detectEmptyResultSetViolation(
    tableName: string,
    expectedCount: number,
    actualCount: number,
    context: Record<string, any>
  ): Promise<void>;
}

// セキュリティ監査設定
export interface SecurityAuditConfig {
  enableAdminAudit: boolean;
  enableGuestAudit: boolean;
  enableSuspiciousActivityDetection: boolean;
  enableUnauthorizedAccessDetection: boolean;
  emptyResultSetThreshold: number; // 空の結果セットを疑わしいと判定する閾値
  bulkAccessThreshold: number; // 大量アクセスを疑わしいと判定する閾値
  retentionDays: number; // ログの保持期間
}