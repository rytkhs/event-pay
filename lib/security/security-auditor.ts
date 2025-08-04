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
          request_method: context.requestMethod,
          request_headers: context.requestHeaders,
          response_status: context.responseStatus
        });

      if (error) {
        console.error('Failed to log unauthorized access:', error);
        await this.fallbackLog('unauthorized_access_audit_failed', { context, error: error.message });
      }
    } catch (error) {
      console.error('Exception in logUnauthorizedAccess:', error);
      await this.fallbackLog('unauthorized_access_audit_exception', { context, error: String(error) });
    }
  }

  /**
   * 空の結果セットを分析して疑わしい活動を検知
   */
  async analyzeEmptyResultSet(
    tableName: string,
    operation: string,
    expectedCount: number,
    actualCount: number,
    context: Record<string, unknown>
  ): Promise<void> {
    if (actualCount === 0 && expectedCount > 0) {
      await this.logSuspiciousActivity({
        activityType: SuspiciousActivityType.EMPTY_RESULT_SET,
        tableName,
        attemptedAction: operation,
        expectedResultCount: expectedCount,
        actualResultCount: actualCount,
        context,
        severity: expectedCount > this.config.emptyResultSetThreshold ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM,
        detectionMethod: 'empty_result_set_analysis'
      });
    }
  }

  /**
   * セキュリティレポートを生成
   */
  async generateSecurityReport(timeRange: TimeRange): Promise<SecurityReport> {
    const supabase = createClient();

    try {
      // 管理者アクセス統計
      const { data: adminAccess } = await supabase
        .from('admin_access_audit')
        .select('*')
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString());

      // ゲストアクセス統計
      const { data: guestAccess } = await supabase
        .from('guest_access_audit')
        .select('*')
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString());

      // 疑わしい活動
      const { data: suspiciousActivities } = await supabase
        .from('suspicious_activity_log')
        .select('*')
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString())
        .order('created_at', { ascending: false });

      // 不正アクセス試行
      const { data: unauthorizedAttempts } = await supabase
        .from('unauthorized_access_log')
        .select('*')
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString())
        .order('created_at', { ascending: false });

      return {
        timeRange,
        adminAccessCount: adminAccess?.length ?? 0,
        guestAccessCount: guestAccess?.length ?? 0,
        suspiciousActivities: suspiciousActivities ?? [],
        unauthorizedAttempts: unauthorizedAttempts ?? [],
        rlsViolationIndicators: await this.analyzeRlsViolationIndicators(timeRange),
        recommendations: this.generateRecommendations(suspiciousActivities ?? [], unauthorizedAttempts ?? [])
      };
    } catch (error) {
      console.error('Failed to generate security report:', error);
      throw new Error(`Security report generation failed: ${error}`);
    }
  }

  /**
   * RLS違反の指標を分析
   */
  private async analyzeRlsViolationIndicators(timeRange: TimeRange): Promise<Array<{
    indicator: string;
    count: number;
    severity: SecuritySeverity;
  }>> {
    const supabase = createClient();

    try {
      // 空の結果セットの頻度を分析
      const { data: emptyResults } = await supabase
        .from('suspicious_activity_log')
        .select('*')
        .eq('activity_type', SuspiciousActivityType.EMPTY_RESULT_SET)
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString());

      const indicators = [];

      if (emptyResults && emptyResults.length > 0) {
        indicators.push({
          indicator: 'Frequent empty result sets',
          count: emptyResults.length,
          severity: emptyResults.length > 10 ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM
        });
      }

      return indicators;
    } catch (error) {
      console.error('Failed to analyze RLS violation indicators:', error);
      return [];
    }
  }

  /**
   * セキュリティ推奨事項を生成
   */
  private generateRecommendations(
    suspiciousActivities: Array<unknown>,
    unauthorizedAttempts: Array<unknown>
  ): string[] {
    const recommendations = [];

    if (suspiciousActivities.length > 10) {
      recommendations.push('High number of suspicious activities detected. Review RLS policies and access patterns.');
    }

    if (unauthorizedAttempts.length > 5) {
      recommendations.push('Multiple unauthorized access attempts detected. Consider implementing additional rate limiting.');
    }

    if (recommendations.length === 0) {
      recommendations.push('No immediate security concerns detected.');
    }

    return recommendations;
  }

  /**
   * フォールバック用のログ記録
   */
  private async fallbackLog(type: string, data: unknown): Promise<void> {
    try {
      // 本来はファイルシステムやメトリクスシステムに記録
      console.error(`SECURITY_AUDIT_FALLBACK [${type}]:`, JSON.stringify(data, null, 2));
    } catch (error) {
      // 最後の手段として標準エラー出力
      console.error(`CRITICAL: Security audit fallback failed for ${type}:`, error);
    }
  }

  /**
   * ゲストトークンをハッシュ化
   */
  hashGuestToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
