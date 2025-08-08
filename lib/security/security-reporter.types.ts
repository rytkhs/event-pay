/**
 * EventPay セキュリティレポート機能 - 型定義
 */

import {
  SecurityReport,
  TimeRange,
  SecuritySeverity,
  AdminReason,
  SecurityRecommendation,
} from "./audit-types";

// ====================================================================
// 1. セキュリティレポーターのインターフェース
// ====================================================================

/**
 * セキュリティレポート生成システムのインターフェース
 */
export interface SecurityReporter {
  /** セキュリティイベントを記録 */
  logSecurityEvent(params: {
    type: string;
    details: Record<string, unknown>;
    userId?: string;
  }): Promise<void>;

  /** 疑わしい活動を記録 */
  logSuspiciousActivity(params: {
    type: string;
    details: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;

  /**
   * 包括的なセキュリティレポートを生成
   */
  generateComprehensiveReport(timeRange: TimeRange): Promise<ComprehensiveSecurityReport>;

  /**
   * 管理者アクセスレポートを生成
   */
  generateAdminAccessReport(timeRange: TimeRange): Promise<AdminAccessReport>;

  /**
   * ゲストアクセスレポートを生成
   */
  generateGuestAccessReport(timeRange: TimeRange): Promise<GuestAccessReport>;

  /**
   * 脅威分析レポートを生成
   */
  generateThreatAnalysisReport(timeRange: TimeRange): Promise<ThreatAnalysisReport>;

  /**
   * RLS違反分析レポートを生成
   */
  generateRlsViolationReport(timeRange: TimeRange): Promise<RlsViolationReport>;

  /**
   * 定期レポートを生成（日次、週次、月次）
   */
  generatePeriodicReport(
    period: ReportPeriod,
    reportType: ReportType
  ): Promise<PeriodicSecurityReport>;

  /**
   * レポートをエクスポート（JSON、CSV、PDF）
   */
  exportReport(report: SecurityReport, format: ExportFormat): Promise<ExportedReport>;
}

// ====================================================================
// 2. 基本型定義
// ====================================================================

export enum ReportPeriod {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
}

export enum ReportType {
  SECURITY_OVERVIEW = "SECURITY_OVERVIEW",
  THREAT_ANALYSIS = "THREAT_ANALYSIS",
  COMPLIANCE = "COMPLIANCE",
  PERFORMANCE = "PERFORMANCE",
}

export enum ExportFormat {
  JSON = "JSON",
  CSV = "CSV",
  PDF = "PDF",
  XLSX = "XLSX",
}

export enum ActionItemStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

// ====================================================================
// 3. レポート型定義
// ====================================================================

/**
 * 包括的なセキュリティレポート
 */
export interface ComprehensiveSecurityReport extends SecurityReport {
  executiveSummary: ExecutiveSummary;
  detailedAnalysis: DetailedAnalysis;
  trendAnalysis: TrendAnalysis;
  complianceStatus: ComplianceStatus;
  actionItems: ActionItem[];
}

/**
 * エグゼクティブサマリー
 */
export interface ExecutiveSummary {
  overallSecurityScore: number; // 0-100のスコア
  riskLevel: SecuritySeverity;
  keyFindings: string[];
  criticalIssues: number;
  resolvedIssues: number;
  newThreats: number;
  complianceScore: number;
}

/**
 * 詳細分析
 */
export interface DetailedAnalysis {
  accessPatterns: AccessPatternAnalysis;
  securityIncidents: SecurityIncidentAnalysis;
  vulnerabilityAssessment: VulnerabilityAssessment;
  performanceImpact: PerformanceImpactAnalysis;
}

/**
 * トレンド分析
 */
export interface TrendAnalysis {
  securityTrends: SecurityTrend[];
  predictiveInsights: PredictiveInsight[];
  seasonalPatterns: SeasonalPattern[];
}

/**
 * コンプライアンス状況
 */
export interface ComplianceStatus {
  gdprCompliance: ComplianceCheck;
  dataRetentionCompliance: ComplianceCheck;
  accessControlCompliance: ComplianceCheck;
  auditLogCompliance: ComplianceCheck;
}

/**
 * アクションアイテム
 */
export interface ActionItem {
  id: string;
  priority: SecuritySeverity;
  category: string;
  title: string;
  description: string;
  assignee?: string;
  dueDate?: Date;
  estimatedEffort: string;
  dependencies: string[];
  status: ActionItemStatus;
}

/**
 * 管理者アクセスレポート
 */
export interface AdminAccessReport {
  timeRange: TimeRange;
  totalAccess: number;
  uniqueAdmins: number;
  accessByReason: Record<AdminReason, AdminAccessStats>;
  accessByUser: UserAccessStats[];
  unusualPatterns: UnusualAccessPattern[];
  complianceIssues: ComplianceIssue[];
  recommendations: SecurityRecommendation[];
}

/**
 * ゲストアクセスレポート
 */
export interface GuestAccessReport {
  timeRange: TimeRange;
  totalAccess: number;
  uniqueTokens: number;
  accessByAction: Record<string, number>;
  accessByEvent: EventAccessStats[];
  failureAnalysis: FailureAnalysis;
  securityConcerns: SecurityConcern[];
  recommendations: SecurityRecommendation[];
}

/**
 * 脅威分析レポート
 */
export interface ThreatAnalysisReport {
  timeRange: TimeRange;
  threatLevel: SecuritySeverity;
  identifiedThreats: IdentifiedThreat[];
  attackVectors: AttackVector[];
  mitigationStrategies: MitigationStrategy[];
  threatIntelligence: ThreatIntelligence;
}

/**
 * RLS違反分析レポート
 */
export interface RlsViolationReport {
  timeRange: TimeRange;
  violationSummary: RlsViolationSummary;
  affectedTables: AffectedTableAnalysis[];
  violationPatterns: ViolationPattern[];
  remediationPlan: RemediationPlan;
}

// ====================================================================
// 4. 補助的な型定義
// ====================================================================

export interface PeriodicSecurityReport {
  period: ReportPeriod;
  reportType: ReportType;
  generatedAt: Date;
  timeRange: TimeRange;
  data: SecurityReport | ComprehensiveSecurityReport | ThreatAnalysisReport;
  previousPeriodComparison?: PeriodComparison;
}

export interface ExportedReport {
  format: ExportFormat;
  data: Buffer | string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface AccessPatternAnalysis {
  peakHours: number[];
  averageSessionDuration: number;
  geographicDistribution: Record<string, number>;
  deviceTypes: Record<string, number>;
  anomalousPatterns: string[];
}

export interface SecurityIncidentAnalysis {
  totalIncidents: number;
  incidentsByType: Record<string, number>;
  averageResolutionTime: number;
  recurringIncidents: string[];
}

export interface VulnerabilityAssessment {
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  mediumVulnerabilities: number;
  lowVulnerabilities: number;
  patchStatus: Record<string, string>;
}

export interface PerformanceImpactAnalysis {
  averageResponseTime: number;
  securityOverhead: number;
  resourceUtilization: Record<string, number>;
  bottlenecks: string[];
}

export interface SecurityTrend {
  metric: string;
  direction: "INCREASING" | "DECREASING" | "STABLE";
  changePercentage: number;
  significance: SecuritySeverity;
}

export interface PredictiveInsight {
  prediction: string;
  confidence: number;
  timeframe: string;
  recommendedActions: string[];
}

export interface SeasonalPattern {
  pattern: string;
  frequency: string;
  impact: SecuritySeverity;
  description: string;
}

export interface ComplianceCheck {
  status: "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL";
  score: number;
  issues: string[];
  recommendations: string[];
}

export interface AdminAccessStats {
  count: number;
  uniqueUsers: number;
  averageDuration: number;
  failureRate: number;
}

export interface UserAccessStats {
  userId: string;
  accessCount: number;
  lastAccess: Date;
  riskScore: number;
  unusualActivity: boolean;
}

export interface UnusualAccessPattern {
  pattern: string;
  frequency: number;
  riskLevel: SecuritySeverity;
  description: string;
}

export interface ComplianceIssue {
  type: string;
  severity: SecuritySeverity;
  description: string;
  remediation: string;
}

export interface EventAccessStats {
  eventId: string;
  accessCount: number;
  uniqueTokens: number;
  failureRate: number;
}

export interface FailureAnalysis {
  totalFailures: number;
  failuresByType: Record<string, number>;
  commonCauses: string[];
  resolutionSuggestions: string[];
}

export interface SecurityConcern {
  type: string;
  severity: SecuritySeverity;
  description: string;
  affectedTokens: number;
}

export interface IdentifiedThreat {
  type: string;
  severity: SecuritySeverity;
  description: string;
  indicators: string[];
  firstDetected: Date;
  lastSeen: Date;
}

export interface AttackVector {
  vector: string;
  likelihood: number;
  impact: SecuritySeverity;
  mitigations: string[];
}

export interface MitigationStrategy {
  threat: string;
  strategy: string;
  effectiveness: number;
  implementationCost: string;
}

export interface ThreatIntelligence {
  sources: string[];
  lastUpdated: Date;
  relevantThreats: string[];
  industryTrends: string[];
}

export interface RlsViolationSummary {
  totalViolations: number;
  violationsByType: Record<string, number>;
  affectedTablesCount: number;
  severityDistribution: Record<SecuritySeverity, number>;
}

export interface AffectedTableAnalysis {
  tableName: string;
  violationCount: number;
  violationTypes: string[];
  riskLevel: SecuritySeverity;
  recommendedActions: string[];
}

export interface ViolationPattern {
  pattern: string;
  frequency: number;
  tables: string[];
  timePattern: string;
}

export interface RemediationPlan {
  immediateActions: string[];
  shortTermActions: string[];
  longTermActions: string[];
  estimatedTimeline: string;
}

export interface PeriodComparison {
  previousPeriod: TimeRange;
  changes: Record<string, number>;
  trends: string[];
  improvements: string[];
  regressions: string[];
}
