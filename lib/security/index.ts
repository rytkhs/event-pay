/**
 * EventPay セキュリティ監査システム - メインエクスポート
 * 
 * セキュリティ監査機能の統合エクスポート
 */

// ====================================================================
// 型定義とインターフェース
// ====================================================================

export * from './audit-types';
export * from './security-auditor.interface';

// ====================================================================
// 実装クラス
// ====================================================================

export { SecurityAuditorImpl } from './security-auditor.impl';
export { SecurityAnalyzerImpl, securityAnalyzer } from './security-analyzer';
export {
  AuditContextBuilderImpl,
  auditContextBuilder,
  createAuditContext,
  createGuestAuditContext,
  createAdminAuditContext,
  createApiAuditContext
} from './audit-context-builder';

// ====================================================================
// デフォルトインスタンス
// ====================================================================

import { SecurityAuditorImpl } from './security-auditor.impl';
import { SecurityAuditConfig } from './security-auditor.interface';

/**
 * デフォルト設定でのSecurityAuditorインスタンス
 */
export const securityAuditor = new SecurityAuditorImpl();

/**
 * カスタム設定でSecurityAuditorインスタンスを作成
 */
export function createSecurityAuditor(config?: Partial<SecurityAuditConfig>): SecurityAuditorImpl {
  return new SecurityAuditorImpl(config);
}

// ====================================================================
// 便利な関数
// ====================================================================

import {
  AdminReason,
  AuditContext,
  DetectionMethod,
  SuspiciousActivityType,
  SecuritySeverity,
  TimeRange,
  PredefinedTimeRange
} from './audit-types';

/**
 * 管理者アクセスを記録する便利関数
 */
export async function logAdminAccess(
  reason: AdminReason,
  context: string,
  auditContext: AuditContext,
  operationDetails?: Record<string, any>
): Promise<void> {
  return securityAuditor.logAdminAccess(reason, context, auditContext, operationDetails);
}

/**
 * ゲストアクセスを記録する便利関数
 */
export async function logGuestAccess(
  token: string,
  action: string,
  auditContext: AuditContext,
  success: boolean,
  additionalInfo?: {
    attendanceId?: string;
    eventId?: string;
    tableName?: string;
    operationType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    resultCount?: number;
    errorCode?: string;
    errorMessage?: string;
  }
): Promise<void> {
  return securityAuditor.logGuestAccess(token, action, auditContext, success, additionalInfo);
}

/**
 * 疑わしい活動を記録する便利関数
 */
export async function logSuspiciousActivity(
  activityType: SuspiciousActivityType,
  context: {
    tableName?: string;
    userRole?: string;
    userId?: string;
    attemptedAction?: string;
    expectedResultCount?: number;
    actualResultCount?: number;
    additionalContext?: Record<string, any>;
    severity?: SecuritySeverity;
    auditContext: AuditContext;
  }
): Promise<void> {
  return securityAuditor.logSuspiciousActivity({
    activityType,
    tableName: context.tableName,
    userRole: context.userRole,
    userId: context.userId,
    attemptedAction: context.attemptedAction,
    expectedResultCount: context.expectedResultCount,
    actualResultCount: context.actualResultCount,
    context: context.additionalContext,
    severity: context.severity || SecuritySeverity.MEDIUM,
    ipAddress: context.auditContext.ipAddress,
    userAgent: context.auditContext.userAgent,
    sessionId: context.auditContext.sessionId,
    detectionMethod: 'APPLICATION_MONITORING'
  });
}

/**
 * 権限拒否を記録する便利関数
 */
export async function logPermissionDenied(
  resource: string,
  requiredPermission: string,
  auditContext: AuditContext,
  detectionMethod: DetectionMethod = DetectionMethod.PERMISSION_CHECK
): Promise<void> {
  return securityAuditor.logPermissionDenied(resource, requiredPermission, auditContext, detectionMethod);
}

/**
 * 空の結果セットを分析する便利関数
 */
export async function analyzeEmptyResultSet(
  tableName: string,
  operation: string,
  expectedCount: number | undefined,
  actualCount: number,
  auditContext: AuditContext,
  additionalContext?: Record<string, any>
): Promise<void> {
  const isUnexpectedlyEmpty = expectedCount !== undefined && expectedCount > 0 && actualCount === 0;

  return securityAuditor.analyzeEmptyResultSet({
    tableName,
    operation,
    expectedCount,
    actualCount,
    isEmpty: actualCount === 0,
    isUnexpectedlyEmpty,
    context: additionalContext
  }, auditContext);
}

/**
 * セキュリティレポートを生成する便利関数
 */
export async function generateSecurityReport(timeRange?: TimeRange | PredefinedTimeRange) {
  if (!timeRange) {
    return securityAuditor.generateSecurityReportForRange(PredefinedTimeRange.LAST_24_HOURS);
  }

  if (typeof timeRange === 'string') {
    return securityAuditor.generateSecurityReportForRange(timeRange);
  }

  return securityAuditor.generateSecurityReport(timeRange);
}

// ====================================================================
// 設定とユーティリティ
// ====================================================================

/**
 * デフォルトのセキュリティ監査設定
 */
export const DEFAULT_SECURITY_AUDIT_CONFIG: SecurityAuditConfig = {
  retentionDays: 90,
  emptyResultSetThreshold: 5,
  enableAutomaticDetection: true,
  alertSettings: {
    enableEmailAlerts: false,
    emailRecipients: [],
    enableSlackAlerts: false
  },
  performance: {
    batchSize: 100,
    maxConcurrentOperations: 10,
    enableAsyncLogging: true
  }
};

/**
 * 時間範囲を作成するヘルパー関数
 */
export function createTimeRange(startDate: Date, endDate: Date): TimeRange {
  return { start: startDate, end: endDate };
}

/**
 * 相対的な時間範囲を作成するヘルパー関数
 */
export function createRelativeTimeRange(hoursAgo: number): TimeRange {
  const end = new Date();
  const start = new Date(end.getTime() - hoursAgo * 60 * 60 * 1000);
  return { start, end };
}

// ====================================================================
// 型ガード関数
// ====================================================================

/**
 * AuditErrorかどうかを判定する型ガード
 */
export function isAuditError(error: any): error is import('./audit-types').AuditError {
  return error instanceof Error && error.name === 'AuditError';
}

/**
 * 重要度が高いセキュリティ問題かどうかを判定
 */
export function isHighSeverityIssue(severity: SecuritySeverity): boolean {
  return severity === SecuritySeverity.HIGH || severity === SecuritySeverity.CRITICAL;
}

/**
 * 即座に対応が必要なセキュリティ問題かどうかを判定
 */
export function requiresImmediateAction(severity: SecuritySeverity): boolean {
  return severity === SecuritySeverity.CRITICAL;
}