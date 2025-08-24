/**
 * EventPay セキュリティ監査システム - セキュリティ分析機能
 *
 * アクセスパターンの分析、脅威レベルの評価、RLS違反リスクの分析を行う
 */

import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { SecurityAnalyzer } from "./security-auditor.interface";
import {
  TimeRange,
  SecuritySeverity,
  SuspiciousActivityEntry,
  SuspiciousActivityType,
  AuditError,
  AuditErrorCode,
} from "./audit-types";
import { isTimeRange, isString, isNumber, isObject } from "./type-guards";

/**
 * セキュリティ分析機能の実装
 */
export class SecurityAnalyzerImpl implements SecurityAnalyzer {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  // ====================================================================
  // アクセスパターン分析
  // ====================================================================

  async analyzeAccessPatterns(timeRange: TimeRange): Promise<{
    unusualPatterns: Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }>;
    recommendations: string[];
  }> {
    // 型ガードでTimeRangeの妥当性を確認
    if (!isTimeRange(timeRange)) {
      throw new AuditError(
        AuditErrorCode.VALIDATION_ERROR,
        "Invalid time range provided for access pattern analysis"
      );
    }

    try {
      const patterns = await Promise.all([
        this.analyzeAdminAccessPatterns(timeRange),
        this.analyzeGuestAccessPatterns(timeRange),
        this.analyzeSuspiciousActivityPatterns(timeRange),
      ]);

      const unusualPatterns = patterns.flat();
      const recommendations = this.generatePatternRecommendations(unusualPatterns);

      return {
        unusualPatterns,
        recommendations,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Failed to analyze access patterns: ${errorMessage}`
      );
    }
  }

  // ====================================================================
  // 脅威レベル評価
  // ====================================================================

  async assessThreatLevel(activities: SuspiciousActivityEntry[]): Promise<{
    overallThreatLevel: SecuritySeverity;
    criticalIssues: number;
    highPriorityIssues: number;
    requiresImmediateAction: boolean;
  }> {
    const criticalIssues = activities.filter(
      (a) => a.severity === SecuritySeverity.CRITICAL
    ).length;
    const highPriorityIssues = activities.filter(
      (a) => a.severity === SecuritySeverity.HIGH
    ).length;
    const mediumIssues = activities.filter((a) => a.severity === SecuritySeverity.MEDIUM).length;

    // 脅威レベルの計算
    let overallThreatLevel: SecuritySeverity;
    if (criticalIssues > 0) {
      overallThreatLevel = SecuritySeverity.CRITICAL;
    } else if (highPriorityIssues > 3) {
      overallThreatLevel = SecuritySeverity.HIGH;
    } else if (highPriorityIssues > 0 || mediumIssues > 10) {
      overallThreatLevel = SecuritySeverity.MEDIUM;
    } else {
      overallThreatLevel = SecuritySeverity.LOW;
    }

    const requiresImmediateAction =
      criticalIssues > 0 || highPriorityIssues > 5 || this.hasRecentSecurityBreach(activities);

    return {
      overallThreatLevel,
      criticalIssues,
      highPriorityIssues,
      requiresImmediateAction,
    };
  }

  // ====================================================================
  // RLS違反リスク分析
  // ====================================================================

  async analyzeRlsViolationRisk(timeRange: TimeRange): Promise<{
    riskLevel: SecuritySeverity;
    suspiciousTables: string[];
    emptyResultSetFrequency: Record<string, number>;
    recommendations: string[];
  }> {
    try {
      // 空の結果セットの頻度を分析
      const { data: emptyResultSets, error } = await this.supabase
        .from("suspicious_activity_log")
        .select("table_name, context, created_at")
        .eq("activity_type", SuspiciousActivityType.EMPTY_RESULT_SET)
        .gte("created_at", timeRange.start.toISOString())
        .lte("created_at", timeRange.end.toISOString());

      if (error) {
        throw new AuditError(
          AuditErrorCode.DATABASE_ERROR,
          `Failed to analyze RLS violation risk: ${error.message}`
        );
      }

      // テーブル別の空の結果セット頻度を計算
      const emptyResultSetFrequency: Record<string, number> = {};
      const suspiciousTables: string[] = [];

      if (emptyResultSets && Array.isArray(emptyResultSets)) {
        emptyResultSets.forEach((entry) => {
          if (isObject(entry) && "table_name" in entry && isString(entry.table_name)) {
            const tableName = entry.table_name;
            emptyResultSetFrequency[tableName] = (emptyResultSetFrequency[tableName] || 0) + 1;
          }
        });
      }

      // 疑わしいテーブルを特定（頻度が高いもの）
      Object.entries(emptyResultSetFrequency).forEach(([tableName, frequency]) => {
        if (frequency > 5) {
          // 閾値は設定可能
          suspiciousTables.push(tableName);
        }
      });

      // リスクレベルの計算
      const riskLevel = this.calculateRlsRiskLevel(emptyResultSetFrequency, suspiciousTables);
      const recommendations = this.generateRlsRecommendations(
        suspiciousTables,
        emptyResultSetFrequency
      );

      return {
        riskLevel,
        suspiciousTables,
        emptyResultSetFrequency,
        recommendations,
      };
    } catch (error) {
      if (error instanceof AuditError) {
        throw error;
      }
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Unexpected error analyzing RLS violation risk: ${error}`
      );
    }
  }

  // ====================================================================
  // プライベートヘルパーメソッド
  // ====================================================================

  private async analyzeAdminAccessPatterns(timeRange: TimeRange): Promise<
    Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }>
  > {
    const { data, error } = await this.supabase
      .from("admin_access_audit")
      .select("reason, user_id, created_at, success")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString());

    if (error) {
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Failed to analyze admin access patterns: ${error.message}`
      );
    }

    const patterns: Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }> = [];

    // データが存在しない場合は空の配列を返す
    if (!data || !Array.isArray(data)) {
      return patterns;
    }

    // 頻繁な管理者アクセスの検知
    const accessCounts: Record<string, number> = {};
    data.forEach((entry) => {
      if (isObject(entry) && "user_id" in entry && isString(entry.user_id)) {
        accessCounts[entry.user_id] = (accessCounts[entry.user_id] || 0) + 1;
      }
    });

    Object.entries(accessCounts).forEach(([userId, count]) => {
      if (isNumber(count) && count > 20) {
        // 閾値
        patterns.push({
          pattern: `FREQUENT_ADMIN_ACCESS_${userId}`,
          frequency: count,
          severity: SecuritySeverity.MEDIUM,
          description: `User ${userId} has ${count} admin access attempts in the time range`,
        });
      }
    });

    // 失敗した管理者アクセスの検知
    const failures = data.filter(
      (entry) => isObject(entry) && "success" in entry && entry.success === false
    ).length;

    if (failures > 5) {
      patterns.push({
        pattern: "HIGH_ADMIN_ACCESS_FAILURES",
        frequency: failures,
        severity: SecuritySeverity.HIGH,
        description: `${failures} failed admin access attempts detected`,
      });
    }

    return patterns;
  }

  private async analyzeGuestAccessPatterns(timeRange: TimeRange): Promise<
    Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }>
  > {
    const { data, error } = await this.supabase
      .from("guest_access_audit")
      .select("guest_token_hash, action, success, created_at")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString());

    if (error) {
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Failed to analyze guest access patterns: ${error.message}`
      );
    }

    const patterns: Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }> = [];

    // データが存在しない場合は空の配列を返す
    if (!data || !Array.isArray(data)) {
      return patterns;
    }

    // 同一トークンからの大量アクセス
    const tokenCounts: Record<string, number> = {};
    data.forEach((entry) => {
      if (isObject(entry) && "guest_token_hash" in entry && isString(entry.guest_token_hash)) {
        const tokenHash = entry.guest_token_hash;
        tokenCounts[tokenHash] = (tokenCounts[tokenHash] || 0) + 1;
      }
    });

    Object.entries(tokenCounts).forEach(([tokenHash, count]) => {
      if (isNumber(count) && count > 50) {
        // 閾値
        patterns.push({
          pattern: `BULK_GUEST_ACCESS_${tokenHash.substring(0, 8)}`,
          frequency: count,
          severity: SecuritySeverity.MEDIUM,
          description: `Guest token ${tokenHash.substring(0, 8)}... has ${count} access attempts`,
        });
      }
    });

    // ゲストアクセス失敗率の分析
    const totalAccess = data.length;
    const failures = data.filter(
      (entry) => isObject(entry) && "success" in entry && entry.success === false
    ).length;

    const failureRate = totalAccess > 0 ? failures / totalAccess : 0;

    if (failureRate > 0.3) {
      // 30%以上の失敗率
      patterns.push({
        pattern: "HIGH_GUEST_ACCESS_FAILURE_RATE",
        frequency: failures,
        severity: SecuritySeverity.HIGH,
        description: `High guest access failure rate: ${(failureRate * 100).toFixed(1)}%`,
      });
    }

    return patterns;
  }

  private async analyzeSuspiciousActivityPatterns(timeRange: TimeRange): Promise<
    Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }>
  > {
    const { data, error } = await this.supabase
      .from("suspicious_activity_log")
      .select("activity_type, severity, table_name, created_at")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString());

    if (error) {
      throw new AuditError(
        AuditErrorCode.DATABASE_ERROR,
        `Failed to analyze suspicious activity patterns: ${error.message}`
      );
    }

    const patterns: Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }> = [];

    // データが存在しない場合は空の配列を返す
    if (!data || !Array.isArray(data)) {
      return patterns;
    }

    // 活動タイプ別の集計
    const activityCounts: Record<string, number> = {};
    data.forEach((entry) => {
      if (isObject(entry) && "activity_type" in entry && isString(entry.activity_type)) {
        const activityType = entry.activity_type;
        activityCounts[activityType] = (activityCounts[activityType] || 0) + 1;
      }
    });

    Object.entries(activityCounts).forEach(([activityType, count]) => {
      if (isNumber(count) && count > 10) {
        // 閾値
        patterns.push({
          pattern: `FREQUENT_${activityType}`,
          frequency: count,
          severity: SecuritySeverity.MEDIUM,
          description: `${count} instances of ${activityType} detected`,
        });
      }
    });

    return patterns;
  }

  private generatePatternRecommendations(
    patterns: Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }>
  ): string[] {
    const recommendations: string[] = [];

    patterns.forEach((pattern) => {
      if (pattern.pattern.includes("FREQUENT_ADMIN_ACCESS")) {
        recommendations.push(
          "Review admin access policies and consider implementing time-based restrictions"
        );
      }
      if (pattern.pattern.includes("HIGH_ADMIN_ACCESS_FAILURES")) {
        recommendations.push(
          "Investigate failed admin access attempts and strengthen authentication"
        );
      }
      if (pattern.pattern.includes("BULK_GUEST_ACCESS")) {
        recommendations.push("Implement rate limiting for guest token access");
      }
      if (pattern.pattern.includes("HIGH_GUEST_ACCESS_FAILURE_RATE")) {
        recommendations.push("Review guest token validation logic and improve error handling");
      }
    });

    // 重複を除去
    return [...new Set(recommendations)];
  }

  private hasRecentSecurityBreach(activities: SuspiciousActivityEntry[]): boolean {
    const recentBreachTypes = [
      SuspiciousActivityType.UNAUTHORIZED_RLS_BYPASS,
      SuspiciousActivityType.ADMIN_ACCESS_ATTEMPT,
    ];

    const recentTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24時間前

    return activities.some(
      (activity) =>
        recentBreachTypes.includes(activity.activityType) &&
        activity.severity === SecuritySeverity.CRITICAL &&
        activity.createdAt &&
        activity.createdAt > recentTime
    );
  }

  private calculateRlsRiskLevel(
    emptyResultSetFrequency: Record<string, number>,
    suspiciousTables: string[]
  ): SecuritySeverity {
    const totalEmptyResults = Object.values(emptyResultSetFrequency).reduce(
      (sum, count) => sum + count,
      0
    );

    if (suspiciousTables.length > 3 || totalEmptyResults > 50) {
      return SecuritySeverity.CRITICAL;
    } else if (suspiciousTables.length > 1 || totalEmptyResults > 20) {
      return SecuritySeverity.HIGH;
    } else if (suspiciousTables.length > 0 || totalEmptyResults > 5) {
      return SecuritySeverity.MEDIUM;
    } else {
      return SecuritySeverity.LOW;
    }
  }

  private generateRlsRecommendations(
    suspiciousTables: string[],
    emptyResultSetFrequency: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    if (suspiciousTables.length > 0) {
      recommendations.push(`Review RLS policies for tables: ${suspiciousTables.join(", ")}`);
      recommendations.push(
        "Audit application code accessing these tables for potential RLS bypasses"
      );
    }

    const highFrequencyTables = Object.entries(emptyResultSetFrequency)
      .filter(([, frequency]) => frequency > 10)
      .map(([tableName]) => tableName);

    if (highFrequencyTables.length > 0) {
      recommendations.push(
        `Investigate frequent empty result sets for: ${highFrequencyTables.join(", ")}`
      );
      recommendations.push("Consider adding additional monitoring for these tables");
    }

    if (recommendations.length === 0) {
      recommendations.push("RLS violation risk appears low, continue monitoring");
    }

    return recommendations;
  }
}

// ====================================================================
// シングルトンインスタンス
// ====================================================================

/**
 * グローバルに使用できるSecurityAnalyzerインスタンス
 */
export const securityAnalyzer = new SecurityAnalyzerImpl();
