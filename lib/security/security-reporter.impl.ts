/**
 * EventPay セキュリティレポート機能 - 実装
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  SecurityReport,
  TimeRange,
  SecuritySeverity,
  AdminReason,
  SecurityRecommendation,
} from "./audit-types";
import { logger } from "@/lib/logging/app-logger";
import { SecurityAuditor } from "./security-auditor.interface";
import { AnomalyDetector, RlsViolationIndicator } from "./anomaly-detector";
import { isObject, isString, isNumber } from "./type-guards";
import {
  SecurityReporter,
  ComprehensiveSecurityReport,
  AdminAccessReport,
  GuestAccessReport,
  ThreatAnalysisReport,
  RlsViolationReport,
  PeriodicSecurityReport,
  ExportedReport,
  ReportPeriod,
  ReportType,
  ExportFormat,
  ExecutiveSummary,
  DetailedAnalysis,
  TrendAnalysis,
  ComplianceStatus,
  ActionItem,
  ActionItemStatus,
  AdminAccessStats,
  UserAccessStats,
  UnusualAccessPattern,
  ComplianceIssue,
  EventAccessStats,
  FailureAnalysis,
  SecurityConcern,
  IdentifiedThreat,
  AttackVector,
  MitigationStrategy,
  ThreatIntelligence,
  RlsViolationSummary,
  AffectedTableAnalysis,
  ViolationPattern,
  RemediationPlan,
  PeriodComparison,
} from "./security-reporter.types";

/**
 * セキュリティレポーター実装クラス
 */
export class SecurityReporterImpl implements SecurityReporter {
  private supabase: SupabaseClient;
  private auditor: SecurityAuditor;
  private anomalyDetector: AnomalyDetector;

  constructor(auditor: SecurityAuditor, anomalyDetector: AnomalyDetector) {
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
    this.anomalyDetector = anomalyDetector;
  }

  // ====================================================================
  // Webhook関連のセキュリティログ
  // ====================================================================

  async logSuspiciousActivity(params: {
    type: string;
    details: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      const mappedType = this.mapActivityType(params.type);

      const { error } = await this.supabase.from("suspicious_activity_log").insert({
        activity_type: mappedType,
        // 詳細情報は context に格納（テーブル仕様に合わせる）
        context: params.details,
        ip_address: params.ip,
        user_agent: params.userAgent,
        severity: this.determineSeverity(params.type),
        created_at: new Date().toISOString(),
      });

      if (error) {
        logger.error("Failed to log suspicious activity", {
          tag: "securityReporter",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (_error) {
      // swallow logging error
    }
  }

  async logSecurityEvent(params: {
    type: string;
    details: Record<string, unknown>;
    userId?: string;
  }): Promise<void> {
    try {
      // データベースのRPCを利用して監査ログへ記録
      const { error } = await this.supabase.rpc("log_security_event", {
        p_details: params.details,
        p_event_type: params.type,
      });

      if (error) {
        logger.error("Failed to log security event", {
          tag: "securityReporter",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (_error) { }
  }

  private determineSeverity(activityType: string): SecuritySeverity {
    const criticalTypes = ["webhook_signature_invalid", "webhook_timestamp_invalid"];
    const highTypes = ["webhook_processing_error", "webhook_processing_failed"];
    const mediumTypes = ["webhook_signature_verified"];

    if (criticalTypes.includes(activityType)) return SecuritySeverity.CRITICAL;
    if (highTypes.includes(activityType)) return SecuritySeverity.HIGH;
    if (mediumTypes.includes(activityType)) return SecuritySeverity.MEDIUM;
    return SecuritySeverity.LOW;
  }

  private mapActivityType(activityType: string): "EMPTY_RESULT_SET" | "ADMIN_ACCESS_ATTEMPT" | "INVALID_TOKEN_PATTERN" | "RATE_LIMIT_EXCEEDED" | "UNAUTHORIZED_RLS_BYPASS" | "BULK_DATA_ACCESS" | "UNUSUAL_ACCESS_PATTERN" {
    switch (activityType) {
      case "webhook_rate_limit_exceeded":
        return "RATE_LIMIT_EXCEEDED";
      case "webhook_signature_invalid":
        // 署名異常はトークン/シグネチャの不正として扱う
        return "INVALID_TOKEN_PATTERN";
      case "webhook_timestamp_invalid":
        return "UNUSUAL_ACCESS_PATTERN";
      case "webhook_processing_failed":
        return "UNUSUAL_ACCESS_PATTERN";
      case "webhook_processing_error":
      case "webhook_missing_signature":
      case "webhook_unexpected_error":
        return "UNUSUAL_ACCESS_PATTERN";
      default:
        return "UNUSUAL_ACCESS_PATTERN";
    }
  }

  // ====================================================================
  // 包括的なセキュリティレポート生成
  // ====================================================================

  async generateComprehensiveReport(timeRange: TimeRange): Promise<ComprehensiveSecurityReport> {
    // 基本的なセキュリティレポートを生成
    const baseReport = await this.auditor.generateSecurityReport(timeRange);

    // 追加の分析データを収集
    const [executiveSummary, detailedAnalysis, trendAnalysis, complianceStatus, actionItems] =
      await Promise.all([
        this.generateExecutiveSummary(baseReport, timeRange),
        this.generateDetailedAnalysis(timeRange),
        this.generateTrendAnalysis(timeRange),
        this.generateComplianceStatus(timeRange),
        this.generateActionItems(baseReport),
      ]);

    return {
      ...baseReport,
      executiveSummary,
      detailedAnalysis,
      trendAnalysis,
      complianceStatus,
      actionItems,
    };
  }

  // ====================================================================
  // 管理者アクセスレポート生成
  // ====================================================================

  async generateAdminAccessReport(timeRange: TimeRange): Promise<AdminAccessReport> {
    const adminStats = await this.auditor.getAdminAccessStats(timeRange);

    // 詳細な管理者アクセス分析
    const { data: adminAccessData, error } = await this.supabase
      .from("admin_access_audit")
      .select("*")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to generate admin access report: ${error.message}`);
    }

    const accessByReason = this.analyzeAccessByReason(adminAccessData || []);
    const accessByUser = this.analyzeAccessByUser(adminAccessData || []);
    const unusualPatterns = await this.detectUnusualAdminPatterns(adminAccessData || []);
    const complianceIssues = this.checkAdminAccessCompliance(adminAccessData || []);

    return {
      timeRange,
      totalAccess: adminStats.totalAccess,
      uniqueAdmins: Object.keys(adminStats.byUser).length,
      accessByReason,
      accessByUser,
      unusualPatterns,
      complianceIssues,
      recommendations: this.generateAdminAccessRecommendations(
        adminStats,
        unusualPatterns,
        complianceIssues
      ),
    };
  }

  // ====================================================================
  // ゲストアクセスレポート生成
  // ====================================================================

  async generateGuestAccessReport(timeRange: TimeRange): Promise<GuestAccessReport> {
    const guestStats = await this.auditor.getGuestAccessStats(timeRange);

    // 詳細なゲストアクセス分析
    const { data: guestAccessData, error } = await this.supabase
      .from("guest_access_audit")
      .select("*")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to generate guest access report: ${error.message}`);
    }

    const accessByEvent = this.analyzeAccessByEvent(guestAccessData || []);
    const failureAnalysis = this.analyzeGuestFailures(guestAccessData || []);
    const securityConcerns = await this.identifyGuestSecurityConcerns(guestAccessData || []);

    return {
      timeRange,
      totalAccess: guestStats.totalAccess,
      uniqueTokens: guestStats.uniqueTokens,
      accessByAction: guestStats.byAction,
      accessByEvent,
      failureAnalysis,
      securityConcerns,
      recommendations: this.generateGuestAccessRecommendations(
        guestStats,
        failureAnalysis,
        securityConcerns
      ),
    };
  }

  // ====================================================================
  // 脅威分析レポート生成
  // ====================================================================

  async generateThreatAnalysisReport(timeRange: TimeRange): Promise<ThreatAnalysisReport> {
    // 疑わしい活動の分析
    const { data: suspiciousData, error } = await this.supabase
      .from("suspicious_activity_log")
      .select("*")
      .gte("created_at", timeRange.start.toISOString())
      .lte("created_at", timeRange.end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to generate threat analysis report: ${error.message}`);
    }

    const threatLevel = this.calculateOverallThreatLevel(suspiciousData || []);
    const identifiedThreats = this.identifyThreats(suspiciousData || []);
    const attackVectors = this.analyzeAttackVectors(suspiciousData || []);
    const mitigationStrategies = this.generateMitigationStrategies(identifiedThreats);
    const threatIntelligence = await this.gatherThreatIntelligence();

    return {
      timeRange,
      threatLevel,
      identifiedThreats,
      attackVectors,
      mitigationStrategies,
      threatIntelligence,
    };
  }

  // ====================================================================
  // RLS違反分析レポート生成
  // ====================================================================

  async generateRlsViolationReport(timeRange: TimeRange): Promise<RlsViolationReport> {
    const rlsIndicators = await this.anomalyDetector.detectPotentialRlsViolations(timeRange);

    const violationSummary = this.summarizeRlsViolations(rlsIndicators);
    const affectedTables = this.analyzeAffectedTables(rlsIndicators);
    const violationPatterns = await this.analyzeViolationPatterns(timeRange);
    const remediationPlan = this.createRemediationPlan(rlsIndicators);

    return {
      timeRange,
      violationSummary,
      affectedTables,
      violationPatterns,
      remediationPlan,
    };
  }

  // ====================================================================
  // 定期レポート生成
  // ====================================================================

  async generatePeriodicReport(
    period: ReportPeriod,
    reportType: ReportType
  ): Promise<PeriodicSecurityReport> {
    const timeRange = this.calculatePeriodTimeRange(period);
    const previousTimeRange = this.calculatePreviousPeriodTimeRange(period, timeRange);

    let data: SecurityReport | ComprehensiveSecurityReport | ThreatAnalysisReport;

    switch (reportType) {
      case ReportType.SECURITY_OVERVIEW:
        data = await this.generateComprehensiveReport(timeRange);
        break;
      case ReportType.THREAT_ANALYSIS:
        data = await this.generateThreatAnalysisReport(timeRange);
        break;
      default:
        data = await this.auditor.generateSecurityReport(timeRange);
    }

    const previousPeriodComparison = await this.generatePeriodComparison(
      timeRange,
      previousTimeRange
    );

    return {
      period,
      reportType,
      generatedAt: new Date(),
      timeRange,
      data,
      previousPeriodComparison,
    };
  }

  // ====================================================================
  // レポートエクスポート
  // ====================================================================

  async exportReport(report: SecurityReport, format: ExportFormat): Promise<ExportedReport> {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const filename = `security-report-${timestamp}`;

    switch (format) {
      case ExportFormat.JSON:
        return this.exportAsJson(report, filename);
      case ExportFormat.CSV:
        return this.exportAsCsv(report, filename);
      case ExportFormat.PDF:
        return this.exportAsPdf(report, filename);
      case ExportFormat.XLSX:
        return this.exportAsXlsx(report, filename);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ====================================================================
  // プライベートヘルパーメソッド
  // ====================================================================

  private async generateExecutiveSummary(
    baseReport: SecurityReport,
    _timeRange: TimeRange
  ): Promise<ExecutiveSummary> {
    const criticalIssues = baseReport.suspiciousActivities.filter(
      (a) => a.severity === SecuritySeverity.CRITICAL
    ).length;

    const highIssues = baseReport.suspiciousActivities.filter(
      (a) => a.severity === SecuritySeverity.HIGH
    ).length;

    // セキュリティスコアの計算（簡略化）
    const overallSecurityScore = Math.max(0, 100 - criticalIssues * 20 - highIssues * 10);

    const riskLevel =
      criticalIssues > 0
        ? SecuritySeverity.CRITICAL
        : highIssues > 0
          ? SecuritySeverity.HIGH
          : SecuritySeverity.MEDIUM;

    return {
      overallSecurityScore,
      riskLevel,
      keyFindings: [
        `${baseReport.adminAccessCount}回の管理者アクセス`,
        `${baseReport.guestAccessCount}回のゲストアクセス`,
        `${baseReport.suspiciousActivities.length}件の疑わしい活動`,
        `${baseReport.unauthorizedAttempts.length}件の不正アクセス試行`,
      ],
      criticalIssues,
      resolvedIssues: 0, // 実装では過去のデータと比較
      newThreats: criticalIssues + highIssues,
      complianceScore: 85, // 実装では実際の計算が必要
    };
  }

  private async generateDetailedAnalysis(_timeRange: TimeRange): Promise<DetailedAnalysis> {
    // 簡略化された実装
    return {
      accessPatterns: {
        peakHours: [9, 10, 14, 15],
        averageSessionDuration: 300, // 5分
        geographicDistribution: { JP: 80, US: 15, Other: 5 },
        deviceTypes: { Desktop: 60, Mobile: 35, Tablet: 5 },
        anomalousPatterns: [],
      },
      securityIncidents: {
        totalIncidents: 0,
        incidentsByType: {},
        averageResolutionTime: 0,
        recurringIncidents: [],
      },
      vulnerabilityAssessment: {
        criticalVulnerabilities: 0,
        highVulnerabilities: 0,
        mediumVulnerabilities: 0,
        lowVulnerabilities: 0,
        patchStatus: {},
      },
      performanceImpact: {
        averageResponseTime: 200,
        securityOverhead: 5,
        resourceUtilization: {},
        bottlenecks: [],
      },
    };
  }

  private async generateTrendAnalysis(_timeRange: TimeRange): Promise<TrendAnalysis> {
    // 簡略化された実装
    return {
      securityTrends: [],
      predictiveInsights: [],
      seasonalPatterns: [],
    };
  }

  private async generateComplianceStatus(_timeRange: TimeRange): Promise<ComplianceStatus> {
    // 簡略化された実装
    return {
      gdprCompliance: {
        status: "COMPLIANT",
        score: 95,
        issues: [],
        recommendations: [],
      },
      dataRetentionCompliance: {
        status: "COMPLIANT",
        score: 90,
        issues: [],
        recommendations: [],
      },
      accessControlCompliance: {
        status: "COMPLIANT",
        score: 85,
        issues: [],
        recommendations: [],
      },
      auditLogCompliance: {
        status: "COMPLIANT",
        score: 100,
        issues: [],
        recommendations: [],
      },
    };
  }

  private async generateActionItems(baseReport: SecurityReport): Promise<ActionItem[]> {
    const actionItems: ActionItem[] = [];

    // 重要な推奨事項をアクションアイテムに変換
    baseReport.recommendations.forEach((rec, index) => {
      if (rec.actionRequired) {
        actionItems.push({
          id: `action-${index + 1}`,
          priority: rec.priority,
          category: rec.category,
          title: rec.title,
          description: rec.description,
          estimatedEffort: this.estimateEffort(rec.priority),
          dependencies: [],
          status: ActionItemStatus.OPEN,
        });
      }
    });

    return actionItems;
  }

  private analyzeAccessByReason(adminAccessData: unknown[]): Record<AdminReason, AdminAccessStats> {
    const stats: Record<AdminReason, AdminAccessStats> = {} as Record<
      AdminReason,
      AdminAccessStats
    >;

    Object.values(AdminReason).forEach((reason) => {
      const reasonData = adminAccessData.filter(
        (a) => isObject(a) && "reason" in a && a.reason === reason
      );
      const failures = reasonData.filter(
        (a) => isObject(a) && "success" in a && a.success === false
      ).length;

      stats[reason] = {
        count: reasonData.length,
        uniqueUsers: new Set(
          reasonData
            .map((a) => (isObject(a) && "user_id" in a && isString(a.user_id) ? a.user_id : null))
            .filter(Boolean)
        ).size,
        averageDuration:
          reasonData.reduce((sum: number, a) => {
            const duration =
              isObject(a) && "duration_ms" in a && isNumber(a.duration_ms) ? a.duration_ms : 0;
            return sum + duration;
          }, 0) / reasonData.length || 0,
        failureRate: reasonData.length > 0 ? failures / reasonData.length : 0,
      };
    });

    return stats;
  }

  private analyzeAccessByUser(adminAccessData: unknown[]): UserAccessStats[] {
    const userStats: Record<string, UserAccessStats> = {};

    adminAccessData.forEach((access) => {
      if (!isObject(access) || !("user_id" in access) || !isString(access.user_id)) return;

      const userId = access.user_id;
      if (!userStats[userId]) {
        userStats[userId] = {
          userId,
          accessCount: 0,
          lastAccess:
            "created_at" in access && isString(access.created_at)
              ? new Date(access.created_at)
              : new Date(),
          riskScore: 0,
          unusualActivity: false,
        };
      }

      userStats[userId].accessCount++;
      if ("created_at" in access && isString(access.created_at)) {
        const accessDate = new Date(access.created_at);
        if (accessDate > userStats[userId].lastAccess) {
          userStats[userId].lastAccess = accessDate;
        }
      }
    });

    // リスクスコアの計算
    Object.values(userStats).forEach((stats) => {
      stats.riskScore = this.calculateUserRiskScore(stats.accessCount);
      stats.unusualActivity = stats.accessCount > 20; // 簡略化された判定
    });

    return Object.values(userStats).sort((a, b) => b.riskScore - a.riskScore);
  }

  private async detectUnusualAdminPatterns(
    adminAccessData: unknown[]
  ): Promise<UnusualAccessPattern[]> {
    const patterns: UnusualAccessPattern[] = [];

    // 時間外アクセスパターンの検出
    const afterHoursAccess = adminAccessData.filter((access) => {
      if (!isObject(access) || !("created_at" in access) || !isString(access.created_at)) {
        return false;
      }
      const hour = new Date(access.created_at).getHours();
      return hour < 8 || hour > 18; // 8時前または18時後
    });

    if (afterHoursAccess.length > 5) {
      patterns.push({
        pattern: "時間外アクセス",
        frequency: afterHoursAccess.length,
        riskLevel: SecuritySeverity.MEDIUM,
        description: `営業時間外に${afterHoursAccess.length}回の管理者アクセスが検出されました`,
      });
    }

    return patterns;
  }

  private checkAdminAccessCompliance(adminAccessData: unknown[]): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];

    // 理由が記録されていないアクセスをチェック
    const missingReasonAccess = adminAccessData.filter((a) => {
      if (!isObject(a)) return true;
      return !("reason" in a && isString(a.reason)) || !("context" in a && isString(a.context));
    });

    if (missingReasonAccess.length > 0) {
      issues.push({
        type: "MISSING_JUSTIFICATION",
        severity: SecuritySeverity.HIGH,
        description: `${missingReasonAccess.length}件の管理者アクセスで理由が記録されていません`,
        remediation: "全ての管理者アクセスに適切な理由を記録してください",
      });
    }

    return issues;
  }

  private generateAdminAccessRecommendations(
    adminStats: Record<string, unknown>,
    unusualPatterns: UnusualAccessPattern[],
    complianceIssues: ComplianceIssue[]
  ): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = [];

    if (complianceIssues.length > 0) {
      recommendations.push({
        priority: SecuritySeverity.HIGH,
        category: "ACCESS_CONTROL",
        title: "管理者アクセスのコンプライアンス改善",
        description: "管理者アクセスの記録と監査プロセスを強化してください",
        actionRequired: true,
      });
    }

    if (unusualPatterns.length > 0) {
      recommendations.push({
        priority: SecuritySeverity.MEDIUM,
        category: "MONITORING",
        title: "異常なアクセスパターンの調査",
        description: "検出された異常なアクセスパターンについて詳細な調査を実施してください",
        actionRequired: true,
      });
    }

    return recommendations;
  }

  private analyzeAccessByEvent(guestAccessData: Record<string, unknown>[]): EventAccessStats[] {
    const eventStats: Record<string, EventAccessStats & { uniqueTokensSet: Set<string> }> = {};

    guestAccessData.forEach((access) => {
      if (!access.event_id || !isString(access.event_id)) return;
      const eventId = access.event_id as string;

      if (!eventStats[eventId]) {
        eventStats[eventId] = {
          eventId: eventId,
          accessCount: 0,
          uniqueTokens: 0,
          uniqueTokensSet: new Set(),
          failureRate: 0,
        };
      }

      eventStats[eventId].accessCount++;
      if (access.guest_token_hash && isString(access.guest_token_hash)) {
        eventStats[eventId].uniqueTokensSet.add(access.guest_token_hash as string);
      }
    });

    // 失敗率とuniqueTokens数の計算
    Object.values(eventStats).forEach((stats) => {
      const eventAccess = guestAccessData.filter((a) => a.event_id === stats.eventId);
      const failures = eventAccess.filter((a) => !a.success).length;
      stats.failureRate = eventAccess.length > 0 ? failures / eventAccess.length : 0;
      stats.uniqueTokens = stats.uniqueTokensSet.size;
    });

    // uniqueTokensSetを除いてEventAccessStats[]として返す
    return Object.values(eventStats)
      .map(({ uniqueTokensSet: _uniqueTokensSet, ...stats }) => stats)
      .sort((a, b) => b.accessCount - a.accessCount);
  }

  private analyzeGuestFailures(guestAccessData: Record<string, unknown>[]): FailureAnalysis {
    const failures = guestAccessData.filter((a) => !a.success);
    const failuresByType: Record<string, number> = {};

    failures.forEach((failure) => {
      const errorCode = isString(failure.error_code) ? (failure.error_code as string) : "UNKNOWN";
      failuresByType[errorCode] = (failuresByType[errorCode] || 0) + 1;
    });

    return {
      totalFailures: failures.length,
      failuresByType,
      commonCauses: Object.keys(failuresByType).sort(
        (a, b) => failuresByType[b] - failuresByType[a]
      ),
      resolutionSuggestions: [
        "トークンの有効性を確認してください",
        "RLSポリシーの設定を見直してください",
        "エラーハンドリングを改善してください",
      ],
    };
  }

  private async identifyGuestSecurityConcerns(
    guestAccessData: Record<string, unknown>[]
  ): Promise<SecurityConcern[]> {
    const concerns: SecurityConcern[] = [];

    // 高頻度アクセストークンの検出
    const tokenCounts: Record<string, number> = {};
    guestAccessData.forEach((access) => {
      if (access.guest_token_hash && isString(access.guest_token_hash)) {
        const tokenHash = access.guest_token_hash as string;
        tokenCounts[tokenHash] = (tokenCounts[tokenHash] || 0) + 1;
      }
    });

    const highFrequencyTokens = Object.entries(tokenCounts).filter(([, count]) => count > 50);
    if (highFrequencyTokens.length > 0) {
      concerns.push({
        type: "HIGH_FREQUENCY_ACCESS",
        severity: SecuritySeverity.MEDIUM,
        description: "異常に高い頻度でアクセスされているゲストトークンが検出されました",
        affectedTokens: highFrequencyTokens.length,
      });
    }

    return concerns;
  }

  private generateGuestAccessRecommendations(
    guestStats: Record<string, unknown>,
    failureAnalysis: FailureAnalysis,
    securityConcerns: SecurityConcern[]
  ): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = [];

    const totalAccess = isNumber(guestStats.totalAccess) ? (guestStats.totalAccess as number) : 0;
    if (failureAnalysis.totalFailures > totalAccess * 0.1) {
      recommendations.push({
        priority: SecuritySeverity.MEDIUM,
        category: "ACCESS_CONTROL",
        title: "ゲストアクセス失敗率の改善",
        description:
          "ゲストアクセスの失敗率が高いため、トークン管理とエラーハンドリングを改善してください",
        actionRequired: true,
      });
    }

    if (securityConcerns.length > 0) {
      recommendations.push({
        priority: SecuritySeverity.HIGH,
        category: "MONITORING",
        title: "ゲストアクセスのセキュリティ強化",
        description:
          "異常なゲストアクセスパターンが検出されました。監視とレート制限を強化してください",
        actionRequired: true,
      });
    }

    return recommendations;
  }

  private calculateOverallThreatLevel(suspiciousData: Record<string, unknown>[]): SecuritySeverity {
    const criticalCount = suspiciousData.filter(
      (d) => d.severity === SecuritySeverity.CRITICAL
    ).length;
    const highCount = suspiciousData.filter((d) => d.severity === SecuritySeverity.HIGH).length;

    if (criticalCount > 0) return SecuritySeverity.CRITICAL;
    if (highCount > 3) return SecuritySeverity.HIGH;
    if (suspiciousData.length > 10) return SecuritySeverity.MEDIUM;
    return SecuritySeverity.LOW;
  }

  private identifyThreats(suspiciousData: Record<string, unknown>[]): IdentifiedThreat[] {
    const threatMap: Record<string, IdentifiedThreat> = {};

    suspiciousData.forEach((activity) => {
      if (!isString(activity.activity_type) || !isString(activity.created_at)) return;

      const threatType = activity.activity_type as string;
      const createdAt = activity.created_at as string;

      if (!threatMap[threatType]) {
        threatMap[threatType] = {
          type: threatType,
          severity: activity.severity as SecuritySeverity,
          description: `${threatType}タイプの脅威が検出されました`,
          indicators: [],
          firstDetected: new Date(createdAt),
          lastSeen: new Date(createdAt),
        };
      }

      const threat = threatMap[threatType];
      const activityDate = new Date(createdAt);

      if (activityDate < threat.firstDetected) {
        threat.firstDetected = activityDate;
      }
      if (activityDate > threat.lastSeen) {
        threat.lastSeen = activityDate;
      }

      if (activity.table_name && isString(activity.table_name)) {
        const tableName = activity.table_name as string;
        if (!threat.indicators.includes(tableName)) {
          threat.indicators.push(tableName);
        }
      }
    });

    return Object.values(threatMap);
  }

  private analyzeAttackVectors(_suspiciousData: Record<string, unknown>[]): AttackVector[] {
    // 簡略化された実装
    return [
      {
        vector: "RLS Policy Bypass",
        likelihood: 0.3,
        impact: SecuritySeverity.HIGH,
        mitigations: ["RLSポリシーの強化", "監視の強化"],
      },
      {
        vector: "Token Enumeration",
        likelihood: 0.2,
        impact: SecuritySeverity.MEDIUM,
        mitigations: ["レート制限", "トークンの複雑化"],
      },
    ];
  }

  private generateMitigationStrategies(threats: IdentifiedThreat[]): MitigationStrategy[] {
    return threats.map((threat) => ({
      threat: threat.type,
      strategy: `${threat.type}に対する対策を実装`,
      effectiveness: 0.8,
      implementationCost: "Medium",
    }));
  }

  private async gatherThreatIntelligence(): Promise<ThreatIntelligence> {
    return {
      sources: ["Internal Analysis", "Security Logs"],
      lastUpdated: new Date(),
      relevantThreats: ["SQL Injection", "RLS Bypass", "Token Abuse"],
      industryTrends: ["Increased API attacks", "Database security focus"],
    };
  }

  private summarizeRlsViolations(indicators: RlsViolationIndicator[]): RlsViolationSummary {
    const totalViolations = indicators.reduce((sum, ind) => sum + ind.frequency, 0);
    const violationsByType: Record<string, number> = {};
    const severityDistribution: Record<SecuritySeverity, number> = {
      [SecuritySeverity.LOW]: 0,
      [SecuritySeverity.MEDIUM]: 0,
      [SecuritySeverity.HIGH]: 0,
      [SecuritySeverity.CRITICAL]: 0,
    };

    indicators.forEach((indicator) => {
      violationsByType["RLS_VIOLATION"] = (violationsByType["RLS_VIOLATION"] || 0) + 1;
      severityDistribution[indicator.severity]++;
    });

    return {
      totalViolations,
      violationsByType,
      affectedTablesCount: indicators.length,
      severityDistribution,
    };
  }

  private analyzeAffectedTables(indicators: RlsViolationIndicator[]): AffectedTableAnalysis[] {
    return indicators.map((indicator) => ({
      tableName: indicator.tableName,
      violationCount: indicator.frequency,
      violationTypes: ["EMPTY_RESULT_SET"],
      riskLevel: indicator.severity,
      recommendedActions: ["RLSポリシーの見直し", "アクセスパターンの調査", "監視の強化"],
    }));
  }

  private async analyzeViolationPatterns(_timeRange: TimeRange): Promise<ViolationPattern[]> {
    // 簡略化された実装
    return [
      {
        pattern: "Empty Result Set Pattern",
        frequency: 10,
        tables: ["attendances", "events"],
        timePattern: "Peak hours",
      },
    ];
  }

  private createRemediationPlan(indicators: RlsViolationIndicator[]): RemediationPlan {
    const hasHighSeverity = indicators.some(
      (i) => i.severity === SecuritySeverity.HIGH || i.severity === SecuritySeverity.CRITICAL
    );

    return {
      immediateActions: hasHighSeverity
        ? ["重要度の高いRLS違反を緊急調査", "影響を受けるテーブルのアクセスを一時制限"]
        : ["RLS違反の詳細調査を開始"],
      shortTermActions: [
        "RLSポリシーの見直しと強化",
        "監視システムの改善",
        "アクセスパターンの分析",
      ],
      longTermActions: [
        "セキュリティ監査プロセスの自動化",
        "予防的セキュリティ対策の実装",
        "定期的なセキュリティレビューの実施",
      ],
      estimatedTimeline: "即座の対応: 24時間以内、短期対応: 1週間以内、長期対応: 1ヶ月以内",
    };
  }

  private calculatePeriodTimeRange(period: ReportPeriod): TimeRange {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case ReportPeriod.DAILY:
        start.setDate(start.getDate() - 1);
        break;
      case ReportPeriod.WEEKLY:
        start.setDate(start.getDate() - 7);
        break;
      case ReportPeriod.MONTHLY:
        start.setMonth(start.getMonth() - 1);
        break;
      case ReportPeriod.QUARTERLY:
        start.setMonth(start.getMonth() - 3);
        break;
    }

    return { start, end };
  }

  private calculatePreviousPeriodTimeRange(
    period: ReportPeriod,
    currentRange: TimeRange
  ): TimeRange {
    const duration = currentRange.end.getTime() - currentRange.start.getTime();
    return {
      start: new Date(currentRange.start.getTime() - duration),
      end: currentRange.start,
    };
  }

  private async generatePeriodComparison(
    currentRange: TimeRange,
    previousRange: TimeRange
  ): Promise<PeriodComparison> {
    // 簡略化された実装
    return {
      previousPeriod: previousRange,
      changes: {
        adminAccess: 5, // 5%増加
        guestAccess: -2, // 2%減少
        suspiciousActivity: 10, // 10%増加
      },
      trends: ["管理者アクセスが増加傾向", "疑わしい活動が増加"],
      improvements: ["ゲストアクセスエラー率の改善"],
      regressions: ["疑わしい活動の増加"],
    };
  }

  private exportAsJson(report: SecurityReport, filename: string): Promise<ExportedReport> {
    const data = JSON.stringify(report, null, 2);
    return Promise.resolve({
      format: ExportFormat.JSON,
      data: Buffer.from(data, "utf-8"),
      filename: `${filename}.json`,
      mimeType: "application/json",
      size: Buffer.byteLength(data, "utf-8"),
    });
  }

  private exportAsCsv(report: SecurityReport, filename: string): Promise<ExportedReport> {
    // 簡略化されたCSV実装
    const csvData = `Time Range,Admin Access,Guest Access,Suspicious Activities,Unauthorized Attempts
${report.timeRange.start.toISOString()}-${report.timeRange.end.toISOString()},${report.adminAccessCount},${report.guestAccessCount},${report.suspiciousActivities.length},${report.unauthorizedAttempts.length}`;

    return Promise.resolve({
      format: ExportFormat.CSV,
      data: Buffer.from(csvData, "utf-8"),
      filename: `${filename}.csv`,
      mimeType: "text/csv",
      size: Buffer.byteLength(csvData, "utf-8"),
    });
  }

  private exportAsPdf(report: SecurityReport, filename: string): Promise<ExportedReport> {
    // PDF生成は実際の実装では専用ライブラリを使用
    const pdfContent = `Security Report\nGenerated: ${new Date().toISOString()}\n\nAdmin Access: ${report.adminAccessCount}\nGuest Access: ${report.guestAccessCount}`;

    return Promise.resolve({
      format: ExportFormat.PDF,
      data: Buffer.from(pdfContent, "utf-8"),
      filename: `${filename}.pdf`,
      mimeType: "application/pdf",
      size: Buffer.byteLength(pdfContent, "utf-8"),
    });
  }

  private exportAsXlsx(report: SecurityReport, filename: string): Promise<ExportedReport> {
    // XLSX生成は実際の実装では専用ライブラリを使用
    const xlsxContent = `Security Report\nAdmin Access: ${report.adminAccessCount}\nGuest Access: ${report.guestAccessCount}`;

    return Promise.resolve({
      format: ExportFormat.XLSX,
      data: Buffer.from(xlsxContent, "utf-8"),
      filename: `${filename}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: Buffer.byteLength(xlsxContent, "utf-8"),
    });
  }

  private estimateEffort(priority: SecuritySeverity): string {
    switch (priority) {
      case SecuritySeverity.CRITICAL:
        return "High (1-2 days)";
      case SecuritySeverity.HIGH:
        return "Medium (3-5 days)";
      case SecuritySeverity.MEDIUM:
        return "Low (1-2 days)";
      default:
        return "Minimal (< 1 day)";
    }
  }

  private calculateUserRiskScore(accessCount: number): number {
    // 簡略化されたリスクスコア計算
    if (accessCount > 50) return 90;
    if (accessCount > 20) return 70;
    if (accessCount > 10) return 50;
    return 30;
  }
}
