/**
 * EventPay セキュリティ監査システム - 型定義
 * 
 * データベースアクセスの監査とセキュリティ違反の検知に使用される型定義
 */

// ====================================================================
// 1. 基本型定義
// ====================================================================

/** 管理者権限使用理由 */
export enum AdminReason {
  USER_CLEANUP = 'user_cleanup',
  TEST_DATA_SETUP = 'test_data_setup',
  SYSTEM_MAINTENANCE = 'system_maintenance',
  EMERGENCY_ACCESS = 'emergency_access',
  DATA_MIGRATION = 'data_migration',
  SECURITY_INVESTIGATION = 'security_investigation'
}

/** 疑わしい活動の種類 */
export enum SuspiciousActivityType {
  EMPTY_RESULT_SET = 'EMPTY_RESULT_SET',
  ADMIN_ACCESS_ATTEMPT = 'ADMIN_ACCESS_ATTEMPT',
  INVALID_TOKEN_PATTERN = 'INVALID_TOKEN_PATTERN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_RLS_BYPASS = 'UNAUTHORIZED_RLS_BYPASS',
  BULK_DATA_ACCESS = 'BULK_DATA_ACCESS',
  UNUSUAL_ACCESS_PATTERN = 'UNUSUAL_ACCESS_PATTERN'
}

/** セキュリティレベル */
export enum SecuritySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/** 検知方法 */
export enum DetectionMethod {
  EMPTY_RESULT = 'EMPTY_RESULT',
  PERMISSION_CHECK = 'PERMISSION_CHECK',
  RATE_LIMIT = 'RATE_LIMIT',
  RLS_POLICY = 'RLS_POLICY',
  PATTERN_ANALYSIS = 'PATTERN_ANALYSIS',
  MANUAL_REPORT = 'MANUAL_REPORT'
}

// ====================================================================
// 2. 監査ログエントリ型定義
// ====================================================================

/** 管理者アクセス監査ログエントリ */
export interface AdminAccessAuditEntry {
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

/** ゲストアクセス監査ログエントリ */
export interface GuestAccessAuditEntry {
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

/** 疑わしい活動ログエントリ */
export interface SuspiciousActivityEntry {
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

/** 不正アクセス試行ログエントリ */
export interface UnauthorizedAccessEntry {
  id?: string;
  attemptedResource: string;
  requiredPermission?: string;
  userContext?: Record<string, any>;
  userId?: string;
  guestTokenHash?: string;
  detectionMethod: DetectionMethod;
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

// ====================================================================
// 3. 監査コンテキスト型定義
// ====================================================================

/** 監査コンテキスト */
export interface AuditContext {
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
  userId?: string;
  guestToken?: string;
  operationStartTime?: Date;
}

/** 結果セット分析情報 */
export interface ResultSetAnalysis {
  tableName: string;
  operation: string;
  expectedCount?: number;
  actualCount: number;
  isEmpty: boolean;
  isUnexpectedlyEmpty: boolean;
  context?: Record<string, any>;
}

/** セキュリティレポート */
export interface SecurityReport {
  timeRange: {
    start: Date;
    end: Date;
  };
  adminAccessCount: number;
  guestAccessCount: number;
  suspiciousActivities: SuspiciousActivitySummary[];
  unauthorizedAttempts: UnauthorizedAttemptSummary[];
  rlsViolationIndicators: RlsViolationIndicator[];
  recommendations: SecurityRecommendation[];
}

/** 疑わしい活動サマリー */
export interface SuspiciousActivitySummary {
  activityType: SuspiciousActivityType;
  count: number;
  severity: SecuritySeverity;
  lastOccurrence: Date;
  affectedTables: string[];
}

/** 不正アクセス試行サマリー */
export interface UnauthorizedAttemptSummary {
  detectionMethod: DetectionMethod;
  count: number;
  uniqueIpAddresses: number;
  mostTargetedResource: string;
  lastAttempt: Date;
}

/** RLS違反指標 */
export interface RlsViolationIndicator {
  tableName: string;
  emptyResultSetFrequency: number;
  suspiciousPatternCount: number;
  severity: SecuritySeverity;
  description: string;
}

/** セキュリティ推奨事項 */
export interface SecurityRecommendation {
  priority: SecuritySeverity;
  category: 'ACCESS_CONTROL' | 'MONITORING' | 'POLICY_UPDATE' | 'INVESTIGATION';
  title: string;
  description: string;
  actionRequired: boolean;
}

// ====================================================================
// 4. 時間範囲型定義
// ====================================================================

/** 時間範囲 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/** 事前定義された時間範囲 */
export enum PredefinedTimeRange {
  LAST_HOUR = 'LAST_HOUR',
  LAST_24_HOURS = 'LAST_24_HOURS',
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
  LAST_90_DAYS = 'LAST_90_DAYS'
}

// ====================================================================
// 5. エラー型定義
// ====================================================================

/** 監査エラーコード */
export enum AuditErrorCode {
  AUDIT_LOG_FAILED = 'AUDIT_LOG_FAILED',
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_TOKEN_HASH = 'INVALID_TOKEN_HASH'
}

/** 監査エラー */
export class AuditError extends Error {
  constructor(
    public code: AuditErrorCode,
    message: string,
    public context?: AuditContext
  ) {
    super(message);
    this.name = 'AuditError';
  }
}