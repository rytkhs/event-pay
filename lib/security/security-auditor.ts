import { createClient } from '@/lib/supabase/server';
import {
  SecurityAuditor,
  AdminAccessAuditLog,
  GuestAccessAuditLog,
  SuspiciousActivity,
  UnauthorizedAccessContext,
  SecurityReport,
  TimeRange,
  SuspiciousActivityType,
  SecuritySeverity,
  SecurityAuditConfig
} from '@/types/security';
import crypto from 'crypto';

/**
 * セキュリティ監査システムの基本実装
 * データベースアクセスの監査とセキュリティ違反の検知を行う
 */
export class DatabaseSecurityAuditor implements SecurityAuditor {
  private config: SecurityAuditConfig;

  constructor(config?: Partial<SecurityAuditConfig>) {
    this.config = {
      enableAdminAudit: true,
      enableGuestAudit: true,
      enableSuspiciousActivityDetection: true,
      enableUnauthorizedAccessDetection: true,
      emptyResultSetThreshold: 3, // 3回連続で空の結果セットが返された場合に疑わしいと判定
      bulkAccessThreshold: 100, // 100件以上のデータアクセスを大量アクセスと判定
      retentionDays: 90,
      ...config
    };
  }

  /**
   * 管理者アクセスを監査ログに記録
   */
  async logAdminAccess(log: AdminAccessAuditLog): Promise<void> {
    if (!this.config.enableAdminAudit) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('admin_access_audit')
        .insert({
          user_id: log.userId,
          reason: log.reason,
          context: log.context,
          operation_details: log.operationDetails,
          ip_address: log.ipAddress,
          user_agent: log.userAgent,
          accessed_tables: log.accessedTables,
          session_id: log.sessionId,
          duration_ms: log.durationMs,
          success: log.success ?? true,
          error_message: log.errorMessage
        });

      if (error) {
        console.error('Failed to log admin access:', error);
        // 監査ログの失敗は重要なので、別の方法で記録を試みる
        await this.fallbackLog('admin_access_audit_failed', { log, error: error.message });
      }
    } catch (error) {
      console.error('Exception in logAdminAccess:', error);
      await this.fallbackLog('admin_access_audit_exception', { log, error: String(error) });
    }
  }

  /**
   * ゲストアクセスを監査ログに記録
   */
  async logGuestAccess(log: GuestAccessAuditLog): Promise<void> {
    if (!this.config.enableGuestAudit) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('guest_access_audit')
        .insert({
          guest_token_hash: log.guestTokenHash,
          attendance_id: log.attendanceId,
          event_id: log.eventId,
          action: log.action,
          table_name: log.tableName,
          operation_type: log.operationType,
          success: log.success,
          result_count: log.resultCount,
          ip_address: log.ipAddress,
          user_agent: log.userAgent,
          session_id: log.sessionId,
          duration_ms: log.durationMs,
          error_code: log.errorCode,
          error_message: log.errorMessage
        });

      if (error) {
        console.error('Failed to log guest access:', error);
        await this.fallbackLog('guest_access_audit_failed', { log, error: error.message });
      }

      // 失敗したアクセスの場合、疑わしい活動として記録
      if (!log.success && this.config.enableSuspiciousActivityDetection) {
        await this.logSuspiciousActivity({
          activityType: SuspiciousActivityType.INVALID_TOKEN_PATTERN,
          tableName: log.tableName,
          userRole: 'guest',
          attemptedAction: log.action,
          context: {
            guestTokenHash: log.guestTokenHash,
            errorCode: log.errorCode,
            errorMessage: log.errorMessage
          },
          severity: SecuritySeverity.MEDIUM,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          sessionId: log.sessionId,
          detectionMethod: 'guest_access_failure'
        });
      }
    } catch (error) {
      console.error('Exception in logGuestAccess:', error);
      await this.fallbackLog('guest_access_audit_exception', { log, error: String(error) });
    }
  }

  /**
   * 疑わしい活動を記録
   */
  async logSuspiciousActivity(activity: SuspiciousActivity): Promise<void> {
    if (!this.config.enableSuspiciousActivityDetection) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('suspicious_activity_log')
        .insert({
          activity_type: activity.activityType,
          table_name: activity.tableName,
          user_role: activity.userRole,
          user_id: activity.userId,
          attempted_action: activity.attemptedAction,
          expected_result_count: activity.expectedResultCount,
          actual_result_count: activity.actualResultCount,
          context: activity.context,
          severity: activity.severity ?? SecuritySeverity.MEDIUM,
          ip_address: activity.ipAddress,
          user_agent: activity.userAgent,
          session_id: activity.sessionId,
          detection_method: activity.detectionMethod,
          false_positive: activity.falsePositive ?? false
        });

      if (error) {
        console.error('Failed to log suspicious activity:', error);
        await this.fallbackLog('suspicious_activity_audit_failed', { activity, error: error.message });
      }
    } catch (error) {
      console.error('Exception in logSuspiciousActivity:', error);
      await this.fallbackLog('suspicious_activity_audit_exception', { activity, error: String(error) });
    }
  }

  /**
   * 不正アクセス試行を記録
   */
  async logUnauthorizedAccess(context: UnauthorizedAccessContext): Promise<void> {
    if (!this.config.enableUnauthorizedAccessDetection) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('unauthorized_access_log')
        .insert({
          attempted_resource: context.attemptedResource,
          required_permission: context.requiredPermission,
          user_context: context.userContext,
          user_id: context.userId,
          guest_token_hash: context.guestTokenHash,
          detection_method: context.detectionMethod,
          blocked_by_rls: context.blockedByRls ?? false,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
          session_id: context.sessionId,
          request_path: context.requestPath,
          request_method: cont
