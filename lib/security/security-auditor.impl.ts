/**
 * EventPay セキュリティ監査システム - 基本実装
 * 
 * SecurityAuditorインターフェースの基本実装
 * Supabaseを使用してセキュリティ監査ログを記録・分析する
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  SecurityAuditor,
  AuditContextBuilder,
  SecurityAnalyzer,
  SecurityAuditConfig
} from './security-auditor.interface';
import {
  AdminReason,
  AdminAccessAuditEntry,
  GuestAccessAuditEntry,
  SuspiciousActivityEntry,
  UnauthorizedAccessEntry,
  AuditContext,
  ResultSetAnalysis,
  SecurityReport,
  TimeRange,
  PredefinedTimeRange,
  SuspiciousActivityType,
  SecuritySeverity,
  DetectionMethod,
  AuditError,
  AuditErrorCode
} from './audit-types';

// ====================================================================
// 1. メイン実装クラス
// ====================================================================

/**
 * SecurityAuditorの基本実装
 * 
 * Supabaseのservice_roleクライアントを使用して
 * セキュリティ監査ログの記録と分析を行う
 */
export class SecurityAuditorImpl implements SecurityAuditor {
  private supabase: SupabaseClient;
  private config: SecurityAuditConfig;

  constructor(config?: Partial<SecurityAuditConfig>) {
    // service_roleクライアントを作成（RLSをバイパスして監査ログにアクセス）
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // デフォルト設定
    this.config = {
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
      },
      ...config
    };
  }

  // ====================================================================
  // 管理者アクセス監査
  // ====================================================================

  async logAdminAccess(
    reason: AdminReason,
    context: string,
    auditContext: AuditContext,
    operationDetails?: Record<string, any>
  ): Promise<void> {
    try {
      const entry: AdminAccessAuditEntry = {
        userId: auditContext.userId,
        reason,
        context,
        operationDetails,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        sessionId: auditContext.sessionId,
        success: true, // 初期値、後でcompleteAdminOperationで更新
        createdAt: new Date()
      };

      const { error } = await this.supabase
        .from('admin_access_audit')
        .insert(entry);

      if (error) {
        throw new AuditError(
          AuditErrorCode.AUDIT_LOG_FAILED,
          `Failed to log admin access: ${error.message}`,
          auditContext
        );
      }

      // 高リスクな管理者操作の場合は疑わしい活動としても記録
      if (reason === AdminReason.EMERGENCY_ACCESS) {
        await this.logSuspiciousActivity({
          activityType: SuspiciousActivityType.ADMIN_ACCESS_ATTEMPT,
          userId: auditContext.userId,
          attemptedAction: context,
          context: { reason, operationDetails },
          severity: SecuritySeverity.HIGH,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          sessionId: auditContext.sessionId,
          detectionMethod: 'ADMIN_ACCESS_MONITORING'
        });
      }
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error logging admin access: ${error}`,
        auditContext
      );
    }
  }

  async completeAdminOperation(
    auditId: string,
    success: boolean,
    durationMs?: number,
    errorMessage?: string,
    accessedTables?: string[]
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('admin_access_audit')
        .update({
          success,
          durationMs,
          errorMessage,
          accessedTables
        })
        .eq('id', auditId);

      if (error) {
        throw new AuditError(
          AuditErrorCode.AUDIT_LOG_FAILED,
          `Failed to complete admin operation log: ${error.message}`
        );
      }
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error completing admin operation: ${error}`
      );
    }
  }

  // ====================================================================
  // ゲストアクセス監査
  // ====================================================================

  async logGuestAccess(
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
    try {
      const tokenHash = this.hashGuestToken(token);

      const entry: GuestAccessAuditEntry = {
        guestTokenHash: tokenHash,
        attendanceId: additionalInfo?.attendanceId,
        eventId: additionalInfo?.eventId,
        action,
        tableName: additionalInfo?.tableName,
        operationType: additionalInfo?.operationType,
        success,
        resultCount: additionalInfo?.resultCount,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        sessionId: auditContext.sessionId,
        errorCode: additionalInfo?.errorCode,
        errorMessage: additionalInfo?.errorMessage,
        createdAt: new Date()
      };

      const { error } = await this.supabase
        .from('guest_access_audit')
        .insert(entry);

      if (error) {
        throw new AuditError(
          AuditErrorCode.AUDIT_LOG_FAILED,
          `Failed to log guest access: ${error.message}`,
          auditContext
        );
      }

      // 失敗したアクセスや異常なパターンを検知
      if (!success || this.isAnomalousGuestAccess(additionalInfo)) {
        await this.logSuspiciousActivity({
          activityType: success
            ? SuspiciousActivityType.UNUSUAL_ACCESS_PATTERN
            : SuspiciousActivityType.INVALID_TOKEN_PATTERN,
          tableName: additionalInfo?.tableName,
          attemptedAction: action,
          context: {
            tokenHash,
            success,
            errorCode: additionalInfo?.errorCode,
            resultCount: additionalInfo?.resultCount
          },
          severity: success ? SecuritySeverity.MEDIUM : SecuritySeverity.HIGH,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          sessionId: auditContext.sessionId,
          detectionMethod: 'GUEST_ACCESS_MONITORING'
        });
      }
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error logging guest access: ${error}`,
        auditContext
      );
    }
  }

  // ====================================================================
  // 疑わしい活動の検知と記録
  // ====================================================================

  async logSuspiciousActivity(activity: SuspiciousActivityEntry): Promise<void> {
    try {
      const { error } = await this.supabase
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
          severity: activity.severity || SecuritySeverity.MEDIUM,
          ip_address: activity.ipAddress,
          user_agent: activity.userAgent,
          session_id: activity.sessionId,
          detection_method: activity.detectionMethod,
          created_at: activity.createdAt || new Date()
        });

      if (error) {
        throw new AuditError(
          AuditErrorCode.AUDIT_LOG_FAILED,
          `Failed to log suspicious activity: ${error.message}`
        );
      }

      // 重要度が高い場合はアラートを送信（将来実装）
      if (activity.severity === SecuritySeverity.CRITICAL ||
        activity.severity === SecuritySeverity.HIGH) {
        await this.sendSecurityAlert(activity);
      }
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error logging suspicious activity: ${error}`
      );
    }
  }

  async analyzeEmptyResultSet(
    analysis: ResultSetAnalysis,
    auditContext: AuditContext
  ): Promise<void> {
    if (!analysis.isEmpty || !analysis.isUnexpectedlyEmpty) {
      return; // 空でないか、期待される空の結果セットの場合は何もしない
    }

    await this.logSuspiciousActivity({
      activityType: SuspiciousActivityType.EMPTY_RESULT_SET,
      tableName: analysis.tableName,
      attemptedAction: analysis.operation,
      expectedResultCount: analysis.expectedCount,
      actualResultCount: analysis.actualCount,
      context: {
        ...analysis.context,
        isUnexpectedlyEmpty: true
      },
      severity: this.calculateEmptyResultSeverity(analysis),
      userId: auditContext.userId,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      sessionId: auditContext.sessionId,
      detectionMethod: 'EMPTY_RESULT_SET_ANALYSIS'
    });
  }

  async detectPotentialRlsViolation(
    tableName: string,
    expectedCount: number,
    actualCount: number,
    auditContext: AuditContext
  ): Promise<void> {
    // 期待される結果数と実際の結果数の差が大きい場合、RLS違反の可能性
    const discrepancyRatio = expectedCount > 0 ? actualCount / expectedCount : 0;

    if (discrepancyRatio < 0.5 && expectedCount > 0) { // 50%以上の結果が欠落
      await this.logSuspiciousActivity({
        activityType: SuspiciousActivityType.UNAUTHORIZED_RLS_BYPASS,
        tableName,
        attemptedAction: 'DATA_ACCESS',
        expectedResultCount: expectedCount,
        actualResultCount: actualCount,
        context: {
          discrepancyRatio,
          potentialRlsViolation: true
        },
        severity: SecuritySeverity.HIGH,
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        sessionId: auditContext.sessionId,
        detectionMethod: 'RLS_VIOLATION_DETECTION'
      });
    }
  }

  // ====================================================================
  // 不正アクセス試行の記録
  // ====================================================================

  async logUnauthorizedAccess(entry: UnauthorizedAccessEntry): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('unauthorized_access_log')
        .insert({
          attempted_resource: entry.attemptedResource,
          required_permission: entry.requiredPermission,
          user_context: entry.userContext,
          user_id: entry.userId,
          guest_token_hash: entry.guestTokenHash,
          detection_method: entry.detectionMethod,
          blocked_by_rls: entry.blockedByRls,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          session_id: entry.sessionId,
          request_path: entry.requestPath,
          request_method: entry.requestMethod,
          request_headers: entry.requestHeaders,
          response_status: entry.responseStatus,
          created_at: entry.createdAt || new Date()
        });

      if (error) {
        throw new AuditError(
          AuditErrorCode.AUDIT_LOG_FAILED,
          `Failed to log unauthorized access: ${error.message}`
        );
      }
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error logging unauthorized access: ${error}`
      );
    }
  }

  async logPermissionDenied(
    resource: string,
    requiredPermission: string,
    auditContext: AuditContext,
    detectionMethod: DetectionMethod
  ): Promise<void> {
    await this.logUnauthorizedAccess({
      attemptedResource: resource,
      requiredPermission,
      userContext: {
        userId: auditContext.userId,
        sessionId: auditContext.sessionId,
        requestPath: auditContext.requestPath,
        requestMethod: auditContext.requestMethod
      },
      userId: auditContext.userId,
      guestTokenHash: auditContext.guestToken ? this.hashGuestToken(auditContext.guestToken) : undefined,
      detectionMethod,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      sessionId: auditContext.sessionId,
      requestPath: auditContext.requestPath,
      requestMethod: auditContext.requestMethod
    });
  }

  // ====================================================================
  // レポート生成（基本実装）
  // ====================================================================

  async generateSecurityReport(timeRange: TimeRange): Promise<SecurityReport> {
    try {
      const [adminStats, guestStats, suspiciousActivities, unauthorizedAttempts] =
        await Promise.all([
          this.getAdminAccessStats(timeRange),
          this.getGuestAccessStats(timeRange),
          this.getSuspiciousActivitiesInRange(timeRange),
          this.getUnauthorizedAttemptsInRange(timeRange)
        ]);

      return {
        timeRange,
        adminAccessCount: adminStats.totalAccess,
        guestAccessCount: guestStats.totalAccess,
        suspiciousActivities: suspiciousActivities,
        unauthorizedAttempts: unauthorizedAttempts,
        rlsViolationIndicators: await this.analyzeRlsViolationIndicators(timeRange),
        recommendations: await this.generateSecurityRecommendations(timeRange)
      };
    } catch (error) {
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Failed to generate security report: ${error}`
      );
    }
  }

  async generateSecurityReportForRange(range: PredefinedTimeRange): Promise<SecurityReport> {
    const timeRange = this.getPredefinedTimeRange(range);
    return this.generateSecurityReport(timeRange);
  }

  async getAdminAccessStats(timeRange: TimeRange): Promise<{
    totalAccess: number;
    byReason: Record<AdminReason, number>;
    byUser: Record<string, number>;
    failureRate: number;
  }> {
    const { data, error } = await this.supabase
      .from('admin_access_audit')
      .select('reason, user_id, success')
      .gte('created_at', timeRange.start.toISOString())
      .lte('created_at', timeRange.end.toISOString());

    if (error) {
      throw new AuditError(AuditErrorCode.DATABASE_ERROR, `Failed to get admin access stats: ${error.message}`);
    }

    const totalAccess = data.length;
    const byReason: Record<AdminReason, number> = {} as Record<AdminReason, number>;
    const byUser: Record<string, number> = {};
    let failures = 0;

    data.forEach(entry => {
      byReason[entry.reason] = (byReason[entry.reason] || 0) + 1;
      if (entry.user_id) {
        byUser[entry.user_id] = (byUser[entry.user_id] || 0) + 1;
      }
      if (!entry.success) {
        failures++;
      }
    });

    return {
      totalAccess,
      byReason,
      byUser,
      failureRate: totalAccess > 0 ? failures / totalAccess : 0
    };
  }

  async getGuestAccessStats(timeRange: TimeRange): Promise<{
    totalAccess: number;
    uniqueTokens: number;
    byAction: Record<string, number>;
    failureRate: number;
    topEvents: Array<{ eventId: string; accessCount: number }>;
  }> {
    const { data, error } = await this.supabase
      .from('guest_access_audit')
      .select('guest_token_hash, action, success, event_id')
      .gte('created_at', timeRange.start.toISOString())
      .lte('created_at', timeRange.end.toISOString());

    if (error) {
      throw new AuditError(AuditErrorCode.DATABASE_ERROR, `Failed to get guest access stats: ${error.message}`);
    }

    const totalAccess = data.length;
    const uniqueTokens = new Set(data.map(entry => entry.guest_token_hash)).size;
    const byAction: Record<string, number> = {};
    const eventCounts: Record<string, number> = {};
    let failures = 0;

    data.forEach(entry => {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      if (entry.event_id) {
        eventCounts[entry.event_id] = (eventCounts[entry.event_id] || 0) + 1;
      }
      if (!entry.success) {
        failures++;
      }
    });

    const topEvents = Object.entries(eventCounts)
      .map(([eventId, accessCount]) => ({ eventId, accessCount }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);

    return {
      totalAccess,
      uniqueTokens,
      byAction,
      failureRate: totalAccess > 0 ? failures / totalAccess : 0,
      topEvents
    };
  }

  // ====================================================================
  // 監査ログ管理
  // ====================================================================

  async cleanupOldAuditLogs(retentionDays: number = this.config.retentionDays): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .rpc('cleanup_old_audit_logs', { retention_days: retentionDays });

      if (error) {
        throw new AuditError(
          AuditErrorCode.DATABASE_ERROR,
          `Failed to cleanup old audit logs: ${error.message}`
        );
      }

      return data || 0;
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error during cleanup: ${error}`
      );
    }
  }

  async validateAuditLogIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // 基本的な整合性チェック
      const checks = await Promise.all([
        this.checkMissingAuditEntries(),
        this.checkDuplicateEntries(),
        this.checkOrphanedEntries()
      ]);

      checks.forEach(check => {
        issues.push(...check.issues);
        recommendations.push(...check.recommendations);
      });

      return {
        isValid: issues.length === 0,
        issues,
        recommendations
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`Integrity check failed: ${error}`],
        recommendations: ['Run manual database integrity check']
      };
    }
  }

  // ====================================================================
  // プライベートヘルパーメソッド
  // ====================================================================

  private hashGuestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isAnomalousGuestAccess(additionalInfo?: {
    resultCount?: number;
    errorCode?: string;
  }): boolean {
    // 異常なアクセスパターンの検知ロジック
    if (additionalInfo?.resultCount !== undefined && additionalInfo.resultCount > 100) {
      return true; // 大量データアクセス
    }

    if (additionalInfo?.errorCode &&
      ['PERMISSION_DENIED', 'INVALID_TOKEN', 'RATE_LIMIT_EXCEEDED'].includes(additionalInfo.errorCode)) {
      return true; // セキュリティ関連エラー
    }

    return false;
  }

  private calculateEmptyResultSeverity(analysis: ResultSetAnalysis): SecuritySeverity {
    if (analysis.expectedCount && analysis.expectedCount > 10) {
      return SecuritySeverity.HIGH; // 多くの結果が期待されていたが空
    }
    if (analysis.expectedCount && analysis.expectedCount > 1) {
      return SecuritySeverity.MEDIUM;
    }
    return SecuritySeverity.LOW;
  }

  private async sendSecurityAlert(activity: SuspiciousActivityEntry): Promise<void> {
    // 将来実装: メール/Slack通知
    console.warn('Security Alert:', {
      type: activity.activityType,
      severity: activity.severity,
      context: activity.context
    });
  }

  private getPredefinedTimeRange(range: PredefinedTimeRange): TimeRange {
    const end = new Date();
    const start = new Date();

    switch (range) {
      case PredefinedTimeRange.LAST_HOUR:
        start.setHours(start.getHours() - 1);
        break;
      case PredefinedTimeRange.LAST_24_HOURS:
        start.setDate(start.getDate() - 1);
        break;
      case PredefinedTimeRange.LAST_7_DAYS:
        start.setDate(start.getDate() - 7);
        break;
      case PredefinedTimeRange.LAST_30_DAYS:
        start.setDate(start.getDate() - 30);
        break;
      case PredefinedTimeRange.LAST_90_DAYS:
        start.setDate(start.getDate() - 90);
        break;
    }

    return { start, end };
  }

  // 以下のメソッドは基本実装のスタブ（将来詳細実装）
  private async getSuspiciousActivitiesInRange(timeRange: TimeRange) {
    // 実装スタブ
    return [];
  }

  private async getUnauthorizedAttemptsInRange(timeRange: TimeRange) {
    // 実装スタブ
    return [];
  }

  private async analyzeRlsViolationIndicators(timeRange: TimeRange) {
    // 実装スタブ
    return [];
  }

  private async generateSecurityRecommendations(timeRange: TimeRange) {
    // 実装スタブ
    return [];
  }

  private async checkMissingAuditEntries() {
    return { issues: [], recommendations: [] };
  }

  private async checkDuplicateEntries() {
    return { issues: [], recommendations: [] };
  }

  private async checkOrphanedEntries() {
    return { issues: [], recommendations: [] };
  }
}