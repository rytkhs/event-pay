/**
 * EventPay セキュリティレポート機能 - テスト
 */

import { SecurityReporterImpl } from "@/lib/security/security-reporter.impl";
import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import { AnomalyDetectorImpl } from "@/lib/security/anomaly-detector";
import { SecuritySeverity, AdminReason } from "@/lib/security/audit-types";
import { ReportPeriod, ReportType, ExportFormat } from "@/lib/security/security-reporter.types";

// モック設定
const mockSupabaseQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({ data: [], error: null }),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => mockSupabaseQuery),
  })),
}));

describe("SecurityReporterImpl", () => {
  let securityReporter: SecurityReporterImpl;
  let mockAuditor: jest.Mocked<SecurityAuditorImpl>;
  let mockAnomalyDetector: jest.Mocked<AnomalyDetectorImpl>;

  beforeEach(() => {
    mockAuditor = {
      generateSecurityReport: jest.fn(),
      getAdminAccessStats: jest.fn(),
      getGuestAccessStats: jest.fn(),
    } as any;

    mockAnomalyDetector = {
      detectPotentialRlsViolations: jest.fn(),
    } as any;

    securityReporter = new SecurityReporterImpl(mockAuditor, mockAnomalyDetector);
  });

  describe("generateComprehensiveReport", () => {
    it("包括的なセキュリティレポートを生成する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const mockBaseReport = {
        timeRange,
        adminAccessCount: 10,
        guestAccessCount: 50,
        suspiciousActivities: [],
        unauthorizedAttempts: [],
        rlsViolationIndicators: [],
        recommendations: [],
      };

      mockAuditor.generateSecurityReport.mockResolvedValue(mockBaseReport);

      const result = await securityReporter.generateComprehensiveReport(timeRange);

      expect(result).toHaveProperty("executiveSummary");
      expect(result).toHaveProperty("detailedAnalysis");
      expect(result).toHaveProperty("trendAnalysis");
      expect(result).toHaveProperty("complianceStatus");
      expect(result).toHaveProperty("actionItems");

      expect(result.executiveSummary).toHaveProperty("overallSecurityScore");
      expect(result.executiveSummary).toHaveProperty("riskLevel");
      expect(result.executiveSummary).toHaveProperty("keyFindings");
      expect(result.executiveSummary).toHaveProperty("criticalIssues");

      expect(typeof result.executiveSummary.overallSecurityScore).toBe("number");
      expect(result.executiveSummary.overallSecurityScore).toBeGreaterThanOrEqual(0);
      expect(result.executiveSummary.overallSecurityScore).toBeLessThanOrEqual(100);
    });
  });

  describe("generateAdminAccessReport", () => {
    it("管理者アクセスレポートを生成する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const mockAdminStats = {
        totalAccess: 10,
        byReason: {
          [AdminReason.USER_CLEANUP]: 3,
          [AdminReason.SYSTEM_MAINTENANCE]: 2,
        } as Record<AdminReason, number>,
        byUser: {
          user1: 5,
          user2: 5,
        },
        failureRate: 0.1,
      };

      mockAuditor.getAdminAccessStats.mockResolvedValue(mockAdminStats);

      const result = await securityReporter.generateAdminAccessReport(timeRange);

      expect(result).toHaveProperty("timeRange");
      expect(result).toHaveProperty("totalAccess");
      expect(result).toHaveProperty("uniqueAdmins");
      expect(result).toHaveProperty("accessByReason");
      expect(result).toHaveProperty("accessByUser");
      expect(result).toHaveProperty("unusualPatterns");
      expect(result).toHaveProperty("complianceIssues");
      expect(result).toHaveProperty("recommendations");

      expect(result.totalAccess).toBe(10);
      expect(result.uniqueAdmins).toBe(2);
      expect(Array.isArray(result.accessByUser)).toBe(true);
      expect(Array.isArray(result.unusualPatterns)).toBe(true);
      expect(Array.isArray(result.complianceIssues)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe("generateGuestAccessReport", () => {
    it("ゲストアクセスレポートを生成する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const mockGuestStats = {
        totalAccess: 100,
        uniqueTokens: 20,
        byAction: {
          view_attendance: 50,
          update_attendance: 30,
        },
        failureRate: 0.05,
        topEvents: [
          { eventId: "event1", accessCount: 30 },
          { eventId: "event2", accessCount: 20 },
        ],
      };

      mockAuditor.getGuestAccessStats.mockResolvedValue(mockGuestStats);

      const result = await securityReporter.generateGuestAccessReport(timeRange);

      expect(result).toHaveProperty("timeRange");
      expect(result).toHaveProperty("totalAccess");
      expect(result).toHaveProperty("uniqueTokens");
      expect(result).toHaveProperty("accessByAction");
      expect(result).toHaveProperty("accessByEvent");
      expect(result).toHaveProperty("failureAnalysis");
      expect(result).toHaveProperty("securityConcerns");
      expect(result).toHaveProperty("recommendations");

      expect(result.totalAccess).toBe(100);
      expect(result.uniqueTokens).toBe(20);
      expect(result.accessByAction).toEqual(mockGuestStats.byAction);
      expect(Array.isArray(result.accessByEvent)).toBe(true);
      expect(Array.isArray(result.securityConcerns)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe("generateThreatAnalysisReport", () => {
    it("脅威分析レポートを生成する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const result = await securityReporter.generateThreatAnalysisReport(timeRange);

      expect(result).toHaveProperty("timeRange");
      expect(result).toHaveProperty("threatLevel");
      expect(result).toHaveProperty("identifiedThreats");
      expect(result).toHaveProperty("attackVectors");
      expect(result).toHaveProperty("mitigationStrategies");
      expect(result).toHaveProperty("threatIntelligence");

      expect(Object.values(SecuritySeverity)).toContain(result.threatLevel);
      expect(Array.isArray(result.identifiedThreats)).toBe(true);
      expect(Array.isArray(result.attackVectors)).toBe(true);
      expect(Array.isArray(result.mitigationStrategies)).toBe(true);
      expect(result.threatIntelligence).toHaveProperty("sources");
      expect(result.threatIntelligence).toHaveProperty("lastUpdated");
    });
  });

  describe("generateRlsViolationReport", () => {
    it("RLS違反分析レポートを生成する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const mockRlsIndicators = [
        {
          tableName: "attendances",
          emptyResultSetFrequency: 5,
          suspiciousPatternCount: 3,
          severity: SecuritySeverity.MEDIUM,
          description: "Test violation",
        },
      ];

      mockAnomalyDetector.detectPotentialRlsViolations.mockResolvedValue(mockRlsIndicators);

      const result = await securityReporter.generateRlsViolationReport(timeRange);

      expect(result).toHaveProperty("timeRange");
      expect(result).toHaveProperty("violationSummary");
      expect(result).toHaveProperty("affectedTables");
      expect(result).toHaveProperty("violationPatterns");
      expect(result).toHaveProperty("remediationPlan");

      expect(result.violationSummary).toHaveProperty("totalViolations");
      expect(result.violationSummary).toHaveProperty("affectedTablesCount");
      expect(Array.isArray(result.affectedTables)).toBe(true);
      expect(Array.isArray(result.violationPatterns)).toBe(true);
      expect(result.remediationPlan).toHaveProperty("immediateActions");
      expect(result.remediationPlan).toHaveProperty("shortTermActions");
      expect(result.remediationPlan).toHaveProperty("longTermActions");
    });
  });

  describe("generatePeriodicReport", () => {
    it("定期レポートを生成する", async () => {
      const mockBaseReport = {
        timeRange: {
          start: new Date("2024-01-01T00:00:00Z"),
          end: new Date("2024-01-02T00:00:00Z"),
        },
        adminAccessCount: 10,
        guestAccessCount: 50,
        suspiciousActivities: [],
        unauthorizedAttempts: [],
        rlsViolationIndicators: [],
        recommendations: [],
      };

      mockAuditor.generateSecurityReport.mockResolvedValue(mockBaseReport);

      const result = await securityReporter.generatePeriodicReport(
        ReportPeriod.DAILY,
        ReportType.SECURITY_OVERVIEW
      );

      expect(result).toHaveProperty("period");
      expect(result).toHaveProperty("reportType");
      expect(result).toHaveProperty("generatedAt");
      expect(result).toHaveProperty("timeRange");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("previousPeriodComparison");

      expect(result.period).toBe(ReportPeriod.DAILY);
      expect(result.reportType).toBe(ReportType.SECURITY_OVERVIEW);
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.previousPeriodComparison).toHaveProperty("changes");
      expect(result.previousPeriodComparison).toHaveProperty("trends");
    });
  });

  describe("exportReport", () => {
    it("JSONフォーマットでレポートをエクスポートする", async () => {
      const mockReport = {
        timeRange: {
          start: new Date("2024-01-01T00:00:00Z"),
          end: new Date("2024-01-02T00:00:00Z"),
        },
        adminAccessCount: 10,
        guestAccessCount: 50,
        suspiciousActivities: [],
        unauthorizedAttempts: [],
        rlsViolationIndicators: [],
        recommendations: [],
      };

      const result = await securityReporter.exportReport(mockReport, ExportFormat.JSON);

      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("mimeType");
      expect(result).toHaveProperty("size");

      expect(result.format).toBe(ExportFormat.JSON);
      expect(result.mimeType).toBe("application/json");
      expect(result.filename).toMatch(/\.json$/);
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(typeof result.size).toBe("number");
      expect(result.size).toBeGreaterThan(0);
    });

    it("CSVフォーマットでレポートをエクスポートする", async () => {
      const mockReport = {
        timeRange: {
          start: new Date("2024-01-01T00:00:00Z"),
          end: new Date("2024-01-02T00:00:00Z"),
        },
        adminAccessCount: 10,
        guestAccessCount: 50,
        suspiciousActivities: [],
        unauthorizedAttempts: [],
        rlsViolationIndicators: [],
        recommendations: [],
      };

      const result = await securityReporter.exportReport(mockReport, ExportFormat.CSV);

      expect(result.format).toBe(ExportFormat.CSV);
      expect(result.mimeType).toBe("text/csv");
      expect(result.filename).toMatch(/\.csv$/);
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it("サポートされていないフォーマットの場合はエラーを投げる", async () => {
      const mockReport = {
        timeRange: {
          start: new Date("2024-01-01T00:00:00Z"),
          end: new Date("2024-01-02T00:00:00Z"),
        },
        adminAccessCount: 10,
        guestAccessCount: 50,
        suspiciousActivities: [],
        unauthorizedAttempts: [],
        rlsViolationIndicators: [],
        recommendations: [],
      };

      await expect(
        securityReporter.exportReport(mockReport, "UNSUPPORTED" as ExportFormat)
      ).rejects.toThrow("Unsupported export format: UNSUPPORTED");
    });
  });
});
