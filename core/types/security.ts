// セキュリティ監査システムの型定義

// ゲストトークンエラー関連の型は core/security/guest-token-errors.ts で定義
// 循環依存を避けるため、ここでは再エクスポートしません
// 必要な場合は direct import を使用: import { GuestErrorCode } from "@core/security/guest-token-errors";

import type { AdminReason } from "@core/security/secure-client-factory.types";

// 疑わしい活動の種類
export enum SuspiciousActivityType {
  EMPTY_RESULT_SET = "EMPTY_RESULT_SET",
  ADMIN_ACCESS_ATTEMPT = "ADMIN_ACCESS_ATTEMPT",
  INVALID_TOKEN_PATTERN = "INVALID_TOKEN_PATTERN",
  RATE_LIMITED = "RATE_LIMITED",
  UNAUTHORIZED_RLS_BYPASS = "UNAUTHORIZED_RLS_BYPASS",
  BULK_DATA_ACCESS = "BULK_DATA_ACCESS",
  UNUSUAL_ACCESS_PATTERN = "UNUSUAL_ACCESS_PATTERN",
}

// セキュリティレベル
export enum SecuritySeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
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
  operationType?: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
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

// 時間範囲
export interface TimeRange {
  start: Date;
  end: Date;
}

// AuditContext型をaudit-types.tsから再エクスポート
export type { AuditContext } from "@core/security/audit-types";

// 管理者権限エラー - lib/security/secure-client-factory.types.ts から利用
