/**
 * EventPay セキュリティ異常検知システム
 *
 * 空の結果セット監視による間接的RLS違反検知
 * 期待される結果数と実際の結果数の比較機能
 * 疑わしい活動パターンの統計的分析機能
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  SuspiciousActivityType,
  SecuritySeverity,
  AuditContext,
  ResultSetAnalysis,
  TimeRange,
} from "./audit-types";
import { SecurityAuditor } from "./security-auditor.interface";
import { isObject, isString } from "./type-guards";

// ====================================================================
// 1. 異常検知システムのインターフェース
// ====================================================================

/**
 * 異常検知システムのメインインターフェース
 */
export interface AnomalyDetector {
  /**
   * 空の結果セットを監視し、異常を検知
   */
  detectEmptyResultSetAnomalies(
    analysis: ResultSetAnalysis,
    auditContext: AuditContext
  ): Promise<AnomalyDetectionResult>;

  /**
   * アクセスパターンの統計的分析
   */
  analyzeAccessPatterns(
    timeRange: TimeRange,
    tableName?: string
  ): Promise<AccessPatternAnalysis>;

  /**
   * RLS違反の間接的指標を検知
   */
  detectPotentialRlsViolations(
    timeRange: TimeRange
  ): Promise<RlsViolationIndicator[]>;

  /**
   * 疑わしい活動の統計的分析
   */
  analyzeSuspiciousActivityTrends(
    timeRange: TimeRange
  ): Promise<SuspiciousActivityTrend[]>;

  /**
   * 異常検知の閾値を動的に調整
   */
  calibrateDetectionThresholds(
    timeRange: TimeRange
  ): Promise<DetectionThresholds>;
}

/**
 * 異常検知結果
 */
export interface AnomalyDetectionResult {
  isAnomalous: boolean;
  severity: SecuritySeverity;
  anomalyType: AnomalyType;
  confidence: number; // 0-1の信頼度
  description: string;
  recommendedActions: string[];
  context: Record<string, unknown>;
}

/**
 * 異常の種類
 */
export enum AnomalyType {
  EMPTY_RESULT_SET = "EMPTY_RESULT_SET",
  UNEXPECTED_DATA_VOLUME = "UNEXPECTED_DATA_VOLUME",
  UNUSUAL_ACCESS_PATTERN = "UNUSUAL_ACCESS_PATTERN",
  POTENTIAL_RLS_BYPASS = "POTENTIAL_RLS_BYPASS",
  SUSPICIOUS_TOKEN_USAGE = "SUSPICIOUS_TOKEN_USAGE",
  RATE_LIMIT_ANOMALY = "RATE_LIMIT_ANOMALY",
}

/**
 * アクセスパターン分析結果
 */
export interface AccessPatternAnalysis {
  tableName?: string;
  timeRange: TimeRange;
  totalAccess: number;
  uniqueUsers: number;
  uniqueTokens: number;
  averageResultSize: number;
  emptyResultFrequency: number;
  anomalousPatterns: AnomalousPattern[];
  baselineMetrics: BaselineMetrics;
  recommendations: string[];
}

/**
 * 異常パターン
 */
export interface AnomalousPattern {
  type: AnomalyType;
  frequency: number;
  severity: SecuritySeverity;
  description: string;
  firstOccurrence: Date;
  lastOccurrence: Date;
  affectedResources: string[];
}

/**
 * ベースライン指標
 */
export interface BaselineMetrics {
  averageAccessPerHour: number;
  averageResultSize: number;
  typicalEmptyResultRate: number;
  peakAccessHours: number[];
  normalUserBehaviorPatterns: string[];
}

/**
 * RLS違反指標
 */
export interface RlsViolationIndicator {
  tableName: string;
  violationType: RlsViolationType;
  severity: SecuritySeverity;
  frequency: number;
  description: string;
  evidence: RlsViolationEvidence;
  recommendedActions: string[];
}

/**
 * RLS違反の種類
 */
export enum RlsViolationType {
  EMPTY_RESULT_ANOMALY = "EMPTY_RESULT_ANOMALY",
  UNEXPECTED_ACCESS_SUCCESS = "UNEXPECTED_ACCESS_SUCCESS",
  PERMISSION_ESCALATION = "PERMISSION_ESCALATION",
  POLICY_BYPASS_ATTEMPT = "POLICY_BYPASS_ATTEMPT",
}

/**
 * RLS違反の証拠
 */
export interface RlsViolationEvidence {
  emptyResultSetCount: number;
  expectedResultCount: number;
  actualResultCount: number;
  suspiciousAccessPatterns: string[];
  timelineOfEvents: Array<{
    timestamp: Date;
    event: string;
    context: Record<string, unknown>;
  }>;
}

/**
 * 疑わしい活動のトレンド
 */
export interface SuspiciousActivityTrend {
  activityType: SuspiciousActivityType;
  trend: TrendDirection;
  changePercentage: number;
  currentFrequency: number;
  previousFrequency: number;
  severity: SecuritySeverity;
  description: string;
}

/**
 * トレンドの方向
 */
export enum TrendDirection {
  INCREASING = "INCREASING",
  DECREASING = "DECREASING",
  STABLE = "STABLE",
  VOLATILE = "VOLATILE",
}

/**
 * 検知閾値
 */
export interface DetectionThresholds {
  emptyResultSetThreshold: number;
  unusualAccessVolumeThreshold: number;
  suspiciousPatternThreshold: number;
  rlsViolationThreshold: number;
  confidenceThreshold: number;
  lastCalibrated: Date;
  calibrationPeriod: TimeRange;
}

// ====================================================================
// 2. 異常検知システムの実装
// ====================================================================

/**
 * 異常検知システムの実装クラス
 */
export class AnomalyDetectorImpl implements AnomalyDetector {
  private supabase: SupabaseClient;
  private auditor: SecurityAuditor;
  private thresholds: DetectionThresholds;

  constructor(auditor: SecurityAuditor, initialThresholds?: Partial<DetectionThresholds>) {
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

    this.auditor = auditor;

    // デフォルト閾値の設定
    this.thresholds = {
      emptyResultSetThreshold: 5,
      unusualAccessVolumeThreshold: 100,
      suspiciousPatternThreshold: 3,
      rlsViolationThreshold: 0.3, // 30%以上の結果欠落で疑わしいと判定
      confidenceThreshold: 0.7,
      lastCalibrated: new Date(),
      calibrationPeriod: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7日前
        end: new Date(),
      },
      ...initialThresholds,
    };
  }

  // ====================================================================
  // 空の結果セット異常検知
  // ====================================================================

  async detectEmptyResultSetAnomalies(
    analysis: ResultSetAnalysis,
    auditContext: AuditContext
  ): Promise<AnomalyDetectionResult> {
    // 基本的な異常チェック
    if (!analysis.isEmpty) {
      return {
        isAnomalous: false,
        severity: SecuritySeverity.LOW,
        anomalyType: AnomalyType.EMPTY_RESULT_SET,
        confidence: 1.0,
        description: "結果セットは空ではありません",
        recommendedActions: [],
        context: { analysis },
      };
    }

    // 過去のパターンと比較
    const historicalPattern = await this.getHistoricalEmptyResultPattern(
      analysis.tableName,
      analysis.operation
    );

    // 異常度の計算
    const anomalyScore = this.calculateEmptyResultAnomalyScore(analysis, historicalPattern);
    const isAnomalous = anomalyScore > this.thresholds.confidenceThreshold;

    if (isAnomalous) {
      // 疑わしい活動として記録
      await this.auditor.logSuspiciousActivity({
        activityType: SuspiciousActivityType.EMPTY_RESULT_SET,
        tableName: analysis.tableName,
        attemptedAction: analysis.operation,
        expectedResultCount: analysis.expectedCount,
        actualResultCount: analysis.actualCount,
        context: {
          anomalyScore,
          historicalPattern,
          isUnexpectedlyEmpty: analysis.isUnexpectedlyEmpty,
        },
        severity: this.mapAnomalyScoreToSeverity(anomalyScore),
        userId: auditContext.userId,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        sessionId: auditContext.sessionId,
        detectionMethod: "EMPTY_RESULT_SET_ANALYSIS",
      });
    }

    return {
      isAnomalous,
      severity: this.mapAnomalyScoreToSeverity(anomalyScore),
      anomalyType: AnomalyType.EMPTY_RESULT_SET,
      confidence: anomalyScore,
      description: this.generateEmptyResultDescription(analysis, historicalPattern, anomalyScore),
      recommendedActions: this.generateEmptyResultRecommendations(analysis, anomalyScore),
      context: {
        analysis,
        historicalPattern,
        anomalyScore,
      },
    };
  }

  // ====================================================================
  // アクセスパターン分析
  // ====================================================================

  async analyzeAccessPatterns(
    timeRange: TimeRange,
    tableName?: string
  ): Promise<AccessPatternAnalysis> {
    // ゲストアクセスログから統計を取得
    const guestAccessQuery = this.supabase
      .from("guest_access_audit")
      .select("*")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString());

    if (tableName) {
      guestAccessQuery.eq("table_name", tableName);
    }

    const { data: guestAccess, error: guestError } = await guestAccessQuery;
    if (guestError) {
      throw new Error(`Failed to analyze guest access patterns: ${guestError.message}`);
    }

    // 管理者アクセスログから統計を取得
    const { data: adminAccess, error: adminError } = await this.supabase
      .from("admin_access_audit")
      .select("*")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString());

    if (adminError) {
      throw new Error(`Failed to analyze admin access patterns: ${adminError.message}`);
    }

    // 統計計算
    const totalAccess = (guestAccess?.length || 0) + (adminAccess?.length || 0);
    const uniqueUsers = new Set(adminAccess?.map(a => a.user_id).filter(Boolean)).size;
    const uniqueTokens = new Set(guestAccess?.map(a => a.guest_token_hash)).size;

    const resultCounts = guestAccess?.map(a => a.result_count || 0).filter(c => c > 0) || [];
    const averageResultSize = resultCounts.length > 0
      ? resultCounts.reduce((sum, count) => sum + count, 0) / resultCounts.length
      : 0;

    const emptyResults = guestAccess?.filter(a => a.result_count === 0).length || 0;
    const emptyResultFrequency = totalAccess > 0 ? emptyResults / totalAccess : 0;

    // 異常パターンの検知
    const anomalousPatterns = await this.detectAnomalousPatterns(
      guestAccess || [],
      adminAccess || [],
      timeRange
    );

    // ベースライン指標の計算
    const baselineMetrics = await this.calculateBaselineMetrics(timeRange, tableName);

    return {
      tableName,
      timeRange,
      totalAccess,
      uniqueUsers,
      uniqueTokens,
      averageResultSize,
      emptyResultFrequency,
      anomalousPatterns,
      baselineMetrics,
      recommendations: this.generateAccessPatternRecommendations(
        anomalousPatterns,
        emptyResultFrequency,
        totalAccess
      ),
    };
  }

  // ====================================================================
  // RLS違反検知
  // ====================================================================

  async detectPotentialRlsViolations(
    timeRange: TimeRange
  ): Promise<RlsViolationIndicator[]> {
    const indicators: RlsViolationIndicator[] = [];

    // 各テーブルについてRLS違反の可能性を分析
    const tables = ["attendances", "events", "payments"];

    for (const tableName of tables) {
      const indicator = await this.analyzeTableForRlsViolations(tableName, timeRange);
      if (indicator) {
        indicators.push(indicator);
      }
    }

    return indicators;
  }

  // ====================================================================
  // 疑わしい活動のトレンド分析
  // ====================================================================

  async analyzeSuspiciousActivityTrends(
    timeRange: TimeRange
  ): Promise<SuspiciousActivityTrend[]> {
    const trends: SuspiciousActivityTrend[] = [];

    // 現在の期間と前の期間を比較
    const periodDuration = timeRange.end.getTime() - timeRange.start.getTime();
    const previousTimeRange: TimeRange = {
      start: new Date(timeRange.start.getTime() - periodDuration),
      end: timeRange.start,
    };

    // 各活動タイプについてトレンドを分析
    const activityTypes = Object.values(SuspiciousActivityType);

    for (const activityType of activityTypes) {
      const trend = await this.analyzeTrendForActivityType(
        activityType,
        timeRange,
        previousTimeRange
      );
      if (trend) {
        trends.push(trend);
      }
    }

    return trends;
  }

  // ====================================================================
  // 検知閾値の動的調整
  // ====================================================================

  async calibrateDetectionThresholds(
    timeRange: TimeRange
  ): Promise<DetectionThresholds> {
    // 過去のデータを基に閾値を調整
    const accessPatterns = await this.analyzeAccessPatterns(timeRange);
    const suspiciousActivities = await this.analyzeSuspiciousActivityTrends(timeRange);

    // 統計的分析に基づく閾値調整
    const newThresholds: DetectionThresholds = {
      ...this.thresholds,
      emptyResultSetThreshold: Math.max(
        3,
        Math.ceil(accessPatterns.emptyResultFrequency * accessPatterns.totalAccess * 1.5)
      ),
      unusualAccessVolumeThreshold: Math.max(
        50,
        Math.ceil(accessPatterns.baselineMetrics.averageAccessPerHour * 3)
      ),
      suspiciousPatternThreshold: Math.max(
        2,
        Math.ceil(suspiciousActivities.length * 0.1)
      ),
      lastCalibrated: new Date(),
      calibrationPeriod: timeRange,
    };

    this.thresholds = newThresholds;
    return newThresholds;
  }

  // ====================================================================
  // プライベートヘルパーメソッド
  // ====================================================================

  private async getHistoricalEmptyResultPattern(
    tableName: string,
    _operation: string
  ): Promise<{
    frequency: number;
    averagePerDay: number;
    lastOccurrence?: Date;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from("suspicious_activity_log")
      .select("created_at")
      .eq("activity_type", SuspiciousActivityType.EMPTY_RESULT_SET)
      .eq("table_name", tableName)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error || !data) {
      return { frequency: 0, averagePerDay: 0 };
    }

    const frequency = data.length;
    const averagePerDay = frequency / 30;
    const lastOccurrence = data.length > 0 ? new Date(data[0].created_at) : undefined;

    return { frequency, averagePerDay, lastOccurrence };
  }

  private calculateEmptyResultAnomalyScore(
    analysis: ResultSetAnalysis,
    historicalPattern: { frequency: number; averagePerDay: number }
  ): number {
    let score = 0;

    // 期待される結果数が多いほど異常度が高い
    if (analysis.expectedCount && analysis.expectedCount > 0) {
      score += Math.min(0.4, analysis.expectedCount / 25); // 最大0.4
    }

    // 過去の頻度と比較
    if (historicalPattern.averagePerDay < 1) {
      score += 0.3; // 過去に少ない場合は異常度が高い
    }

    // 明示的に予期しない空の結果の場合
    if (analysis.isUnexpectedlyEmpty) {
      score += 0.4;
    }

    return Math.min(1.0, score);
  }

  private mapAnomalyScoreToSeverity(score: number): SecuritySeverity {
    if (score >= 0.9) return SecuritySeverity.CRITICAL;
    if (score >= 0.7) return SecuritySeverity.HIGH;
    if (score >= 0.5) return SecuritySeverity.MEDIUM;
    return SecuritySeverity.LOW;
  }

  private generateEmptyResultDescription(
    analysis: ResultSetAnalysis,
    historicalPattern: { frequency: number; averagePerDay: number },
    anomalyScore: number
  ): string {
    const baseDesc = `テーブル「${analysis.tableName}」での「${analysis.operation}」操作で空の結果セットが検出されました。`;

    if (analysis.expectedCount && analysis.expectedCount > 0) {
      return `${baseDesc} ${analysis.expectedCount}件の結果が期待されていましたが、実際は0件でした。異常度: ${(anomalyScore * 100).toFixed(1)}%`;
    }

    if (historicalPattern.averagePerDay < 0.5) {
      return `${baseDesc} 過去30日間でこのパターンは稀です（平均${historicalPattern.averagePerDay.toFixed(2)}回/日）。`;
    }

    return `${baseDesc} 異常度: ${(anomalyScore * 100).toFixed(1)}%`;
  }

  private generateEmptyResultRecommendations(
    analysis: ResultSetAnalysis,
    anomalyScore: number
  ): string[] {
    const recommendations: string[] = [];

    if (anomalyScore > 0.8) {
      recommendations.push("緊急調査が必要です。RLS違反の可能性があります。");
      recommendations.push("関連するアクセスログを詳細に確認してください。");
    }

    if (analysis.expectedCount && analysis.expectedCount > 10) {
      recommendations.push("大量のデータアクセスが期待されていました。権限設定を確認してください。");
    }

    if (analysis.isUnexpectedlyEmpty) {
      recommendations.push("アプリケーションロジックとRLSポリシーの整合性を確認してください。");
    }

    recommendations.push("継続的な監視を行い、パターンの変化を追跡してください。");

    return recommendations;
  }

  private async detectAnomalousPatterns(
    guestAccess: unknown[],
    adminAccess: unknown[],
    _timeRange: TimeRange
  ): Promise<AnomalousPattern[]> {
    const patterns: AnomalousPattern[] = [];

    // 短時間での大量アクセスパターン
    const hourlyAccess = this.groupAccessByHour(guestAccess, adminAccess);
    for (const [hour, count] of Object.entries(hourlyAccess)) {
      if (count > this.thresholds.unusualAccessVolumeThreshold) {
        patterns.push({
          type: AnomalyType.UNUSUAL_ACCESS_PATTERN,
          frequency: count,
          severity: SecuritySeverity.MEDIUM,
          description: `${hour}時台に異常に多いアクセス（${count}回）`,
          firstOccurrence: new Date(hour),
          lastOccurrence: new Date(hour),
          affectedResources: ["access_logs"],
        });
      }
    }

    // 同一トークンでの異常なアクセスパターン
    const tokenPatterns = this.analyzeTokenAccessPatterns(guestAccess);
    patterns.push(...tokenPatterns);

    return patterns;
  }

  private groupAccessByHour(guestAccess: unknown[], adminAccess: unknown[]): Record<string, number> {
    const hourlyCount: Record<string, number> = {};

    [...guestAccess, ...adminAccess].forEach(access => {
      if (isObject(access) && 'created_at' in access && isString(access.created_at)) {
        const hour = new Date(access.created_at).toISOString().slice(0, 13); // YYYY-MM-DDTHH
        hourlyCount[hour] = (hourlyCount[hour] || 0) + 1;
      }
    });

    return hourlyCount;
  }

  private analyzeTokenAccessPatterns(guestAccess: unknown[]): AnomalousPattern[] {
    const patterns: AnomalousPattern[] = [];
    const tokenCounts: Record<string, number> = {};

    guestAccess.forEach(access => {
      if (isObject(access) && 'guest_token_hash' in access && isString(access.guest_token_hash)) {
        const token = access.guest_token_hash;
        tokenCounts[token] = (tokenCounts[token] || 0) + 1;
      }
    });

    // 異常に多いアクセスを持つトークンを検出
    Object.entries(tokenCounts).forEach(([token, count]) => {
      if (count > 50) { // 閾値: 50回以上のアクセス
        patterns.push({
          type: AnomalyType.SUSPICIOUS_TOKEN_USAGE,
          frequency: count,
          severity: count > 100 ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM,
          description: `ゲストトークンの異常な使用頻度（${count}回）`,
          firstOccurrence: new Date(), // 実際の実装では最初のアクセス時刻を使用
          lastOccurrence: new Date(), // 実際の実装では最後のアクセス時刻を使用
          affectedResources: [token.slice(0, 8) + "..."], // トークンの一部のみ表示
        });
      }
    });

    return patterns;
  }

  private async calculateBaselineMetrics(
    _timeRange: TimeRange,
    _tableName?: string
  ): Promise<BaselineMetrics> {
    // 簡略化された実装 - 実際にはより詳細な統計分析が必要
    return {
      averageAccessPerHour: 10,
      averageResultSize: 5,
      typicalEmptyResultRate: 0.1,
      peakAccessHours: [9, 10, 14, 15], // 9-10時、14-15時がピーク
      normalUserBehaviorPatterns: [
        "morning_access",
        "afternoon_access",
        "event_registration_period"
      ],
    };
  }

  private generateAccessPatternRecommendations(
    anomalousPatterns: AnomalousPattern[],
    emptyResultFrequency: number,
    totalAccess: number
  ): string[] {
    const recommendations: string[] = [];

    if (anomalousPatterns.length > 0) {
      recommendations.push(`${anomalousPatterns.length}個の異常パターンが検出されました。詳細な調査を推奨します。`);
    }

    if (emptyResultFrequency > 0.3) {
      recommendations.push("空の結果セットの頻度が高すぎます（30%以上）。RLSポリシーの見直しを検討してください。");
    }

    if (totalAccess > 1000) {
      recommendations.push("アクセス量が多いため、パフォーマンス監視を強化してください。");
    }

    if (recommendations.length === 0) {
      recommendations.push("現在のアクセスパターンは正常範囲内です。継続的な監視を維持してください。");
    }

    return recommendations;
  }

  private async analyzeTableForRlsViolations(
    tableName: string,
    timeRange: TimeRange
  ): Promise<RlsViolationIndicator | null> {
    // 疑わしい活動ログからRLS関連の問題を検索
    const { data, error } = await this.supabase
      .from("suspicious_activity_log")
      .select("*")
      .eq("table_name", tableName)
      .in("activity_type", [
        SuspiciousActivityType.EMPTY_RESULT_SET,
        SuspiciousActivityType.UNAUTHORIZED_RLS_BYPASS
      ])
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString());

    if (error || !data || data.length === 0) {
      return null;
    }

    const emptyResultCount = data.filter(
      d => d.activity_type === SuspiciousActivityType.EMPTY_RESULT_SET
    ).length;

    const bypassAttempts = data.filter(
      d => d.activity_type === SuspiciousActivityType.UNAUTHORIZED_RLS_BYPASS
    ).length;

    if (emptyResultCount < this.thresholds.emptyResultSetThreshold && bypassAttempts === 0) {
      return null;
    }

    const severity = bypassAttempts > 0 ? SecuritySeverity.HIGH :
      emptyResultCount > 10 ? SecuritySeverity.MEDIUM : SecuritySeverity.LOW;

    return {
      tableName,
      violationType: bypassAttempts > 0 ?
        RlsViolationType.POLICY_BYPASS_ATTEMPT :
        RlsViolationType.EMPTY_RESULT_ANOMALY,
      severity,
      frequency: data.length,
      description: `テーブル「${tableName}」でRLS違反の可能性（空の結果セット: ${emptyResultCount}回、バイパス試行: ${bypassAttempts}回）`,
      evidence: {
        emptyResultSetCount: emptyResultCount,
        expectedResultCount: 0, // 実際の実装では計算が必要
        actualResultCount: 0,
        suspiciousAccessPatterns: data.map(d => d.activity_type),
        timelineOfEvents: data.map(d => ({
          timestamp: new Date(d.created_at),
          event: d.activity_type,
          context: d.context || {},
        })),
      },
      recommendedActions: [
        "RLSポリシーの設定を確認してください",
        "関連するアクセスログを詳細に調査してください",
        "必要に応じてポリシーを強化してください",
      ],
    };
  }

  private async analyzeTrendForActivityType(
    activityType: SuspiciousActivityType,
    currentTimeRange: TimeRange,
    previousTimeRange: TimeRange
  ): Promise<SuspiciousActivityTrend | null> {
    const [currentData, previousData] = await Promise.all([
      this.supabase
        .from("suspicious_activity_log")
        .select("id")
        .eq("activity_type", activityType)
        .gte("created_at", currentTimeRange.start.toISOString())
        .lte("created_at", currentTimeRange.end.toISOString()),
      this.supabase
        .from("suspicious_activity_log")
        .select("id")
        .eq("activity_type", activityType)
        .gte("created_at", previousTimeRange.start.toISOString())
        .lte("created_at", previousTimeRange.end.toISOString()),
    ]);

    if (currentData.error || previousData.error) {
      return null;
    }

    const currentFrequency = currentData.data?.length || 0;
    const previousFrequency = previousData.data?.length || 0;

    if (currentFrequency === 0 && previousFrequency === 0) {
      return null;
    }

    const changePercentage = previousFrequency > 0
      ? ((currentFrequency - previousFrequency) / previousFrequency) * 100
      : currentFrequency > 0 ? 100 : 0;

    let trend: TrendDirection;
    if (Math.abs(changePercentage) < 10) {
      trend = TrendDirection.STABLE;
    } else if (changePercentage > 50) {
      trend = TrendDirection.VOLATILE;
    } else if (changePercentage > 0) {
      trend = TrendDirection.INCREASING;
    } else {
      trend = TrendDirection.DECREASING;
    }

    const severity = currentFrequency > 10 ? SecuritySeverity.HIGH :
      currentFrequency > 5 ? SecuritySeverity.MEDIUM : SecuritySeverity.LOW;

    return {
      activityType,
      trend,
      changePercentage,
      currentFrequency,
      previousFrequency,
      severity,
      description: `${activityType}の頻度が${changePercentage.toFixed(1)}%変化（${previousFrequency} → ${currentFrequency}）`,
    };
  }
}