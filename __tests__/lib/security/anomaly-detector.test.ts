/**
 * EventPay 異常検知システム - テスト
 */

import { AnomalyDetectorImpl, AnomalyType } from "@/lib/security/anomaly-detector";
import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import { SecuritySeverity, SuspiciousActivityType } from "@/lib/security/audit-types";

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

describe("AnomalyDetectorImpl", () => {
  let anomalyDetector: AnomalyDetectorImpl;
  let mockAuditor: jest.Mocked<SecurityAuditorImpl>;

  beforeEach(() => {
    mockAuditor = {
      logSuspiciousActivity: jest.fn(),
    } as any;

    anomalyDetector = new AnomalyDetectorImpl(mockAuditor);
  });

  describe("detectEmptyResultSetAnomalies", () => {
    it("空でない結果セットの場合は異常なしと判定する", async () => {
      const analysis = {
        tableName: "attendances",
        operation: "SELECT",
        actualCount: 5,
        isEmpty: false,
        isUnexpectedlyEmpty: false,
      };

      const auditContext = {
        userId: "test-user",
        sessionId: "test-session",
      };

      const result = await anomalyDetector.detectEmptyResultSetAnomalies(analysis, auditContext);

      expect(result.isAnomalous).toBe(false);
      expect(result.anomalyType).toBe(AnomalyType.EMPTY_RESULT_SET);
      expect(result.confidence).toBe(1.0);
    });

    it("予期しない空の結果セットの場合は異常と判定する", async () => {
      const analysis = {
        tableName: "attendances",
        operation: "SELECT",
        expectedCount: 10,
        actualCount: 0,
        isEmpty: true,
        isUnexpectedlyEmpty: true,
      };

      const auditContext = {
        userId: "test-user",
        sessionId: "test-session",
      };

      const result = await anomalyDetector.detectEmptyResultSetAnomalies(analysis, auditContext);

      expect(result.isAnomalous).toBe(true);
      expect(result.anomalyType).toBe(AnomalyType.EMPTY_RESULT_SET);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.severity).toBeOneOf([
        SecuritySeverity.MEDIUM,
        SecuritySeverity.HIGH,
        SecuritySeverity.CRITICAL,
      ]);
      expect(mockAuditor.logSuspiciousActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: SuspiciousActivityType.EMPTY_RESULT_SET,
          tableName: "attendances",
          attemptedAction: "SELECT",
          expectedResultCount: 10,
          actualResultCount: 0,
        })
      );
    });

    it("期待される結果数が多い場合は高い異常度を返す", async () => {
      const analysis = {
        tableName: "attendances",
        operation: "SELECT",
        expectedCount: 50,
        actualCount: 0,
        isEmpty: true,
        isUnexpectedlyEmpty: true,
      };

      const auditContext = {
        userId: "test-user",
        sessionId: "test-session",
      };

      const result = await anomalyDetector.detectEmptyResultSetAnomalies(analysis, auditContext);

      expect(result.isAnomalous).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.severity).toBeOneOf([SecuritySeverity.HIGH, SecuritySeverity.CRITICAL]);
    });
  });

  describe("analyzeAccessPatterns", () => {
    it("アクセスパターンを正しく分析する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      // モックデータの設定は実際のSupabaseクライアントのモックが必要
      // ここでは基本的な構造のテストのみ実施
      const result = await anomalyDetector.analyzeAccessPatterns(timeRange);

      expect(result).toHaveProperty("timeRange");
      expect(result).toHaveProperty("totalAccess");
      expect(result).toHaveProperty("uniqueUsers");
      expect(result).toHaveProperty("uniqueTokens");
      expect(result).toHaveProperty("averageResultSize");
      expect(result).toHaveProperty("emptyResultFrequency");
      expect(result).toHaveProperty("anomalousPatterns");
      expect(result).toHaveProperty("baselineMetrics");
      expect(result).toHaveProperty("recommendations");
    });
  });

  describe("detectPotentialRlsViolations", () => {
    it("RLS違反の可能性を検知する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const result = await anomalyDetector.detectPotentialRlsViolations(timeRange);

      expect(Array.isArray(result)).toBe(true);
      // 実際のデータベースアクセスのモックが必要なため、
      // ここでは基本的な戻り値の型のみテスト
    });
  });

  describe("analyzeSuspiciousActivityTrends", () => {
    it("疑わしい活動のトレンドを分析する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const result = await anomalyDetector.analyzeSuspiciousActivityTrends(timeRange);

      expect(Array.isArray(result)).toBe(true);
      // 実際のデータベースアクセスのモックが必要なため、
      // ここでは基本的な戻り値の型のみテスト
    });
  });

  describe("calibrateDetectionThresholds", () => {
    it("検知閾値を動的に調整する", async () => {
      const timeRange = {
        start: new Date("2024-01-01T00:00:00Z"),
        end: new Date("2024-01-02T00:00:00Z"),
      };

      const result = await anomalyDetector.calibrateDetectionThresholds(timeRange);

      expect(result).toHaveProperty("emptyResultSetThreshold");
      expect(result).toHaveProperty("unusualAccessVolumeThreshold");
      expect(result).toHaveProperty("suspiciousPatternThreshold");
      expect(result).toHaveProperty("rlsViolationThreshold");
      expect(result).toHaveProperty("confidenceThreshold");
      expect(result).toHaveProperty("lastCalibrated");
      expect(result).toHaveProperty("calibrationPeriod");

      expect(typeof result.emptyResultSetThreshold).toBe("number");
      expect(typeof result.unusualAccessVolumeThreshold).toBe("number");
      expect(typeof result.suspiciousPatternThreshold).toBe("number");
      expect(typeof result.rlsViolationThreshold).toBe("number");
      expect(typeof result.confidenceThreshold).toBe("number");
      expect(result.lastCalibrated).toBeInstanceOf(Date);
    });
  });
});

// カスタムマッチャーの追加
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(", ")}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(", ")}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: any[]): R;
    }
  }
}