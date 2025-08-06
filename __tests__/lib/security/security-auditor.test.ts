/**
 * EventPay セキュリティ監査システム - テスト
 *
 * SecurityAuditorの基本機能をテストする
 */

import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import {
  AdminReason,
  SecuritySeverity,
  SuspiciousActivityType,
  DetectionMethod,
  AuditError,
  AuditErrorCode,
} from "@/lib/security/audit-types";
import { createAuditContext } from "@/lib/security/audit-context-builder";

// Supabaseクライアントのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null })),
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ error: null, data: [] })),
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({ error: null, data: [] })),
        })),
        single: jest.fn(() => ({ error: null, data: null })),
      })),
    })),
    rpc: jest.fn(() => ({ error: null, data: 0 })),
  })),
}));

// Request APIのモック（Node.js環境用）
global.Request = class Request {
  constructor(
    public url: string,
    public init?: RequestInit
  ) {
    this.method = init?.method || "GET";
    this.headers = new Map(Object.entries(init?.headers || {}));
  }
  method: string;
  headers: Map<string, string>;
} as any;

describe("SecurityAuditorImpl", () => {
  let auditor: SecurityAuditorImpl;
  let mockAuditContext: any;

  beforeEach(() => {
    auditor = new SecurityAuditorImpl();
    mockAuditContext = {
      sessionId: "test-session-123",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0 Test Browser",
      requestPath: "/api/test",
      requestMethod: "GET",
      userId: "user-123",
      operationStartTime: new Date(),
    };
  });

  describe("管理者アクセス監査", () => {
    it("管理者アクセスを正常に記録できる", async () => {
      await expect(
        auditor.logAdminAccess(
          AdminReason.SYSTEM_MAINTENANCE,
          "Database maintenance operation",
          mockAuditContext,
          { operation: "cleanup_old_data" }
        )
      ).resolves.not.toThrow();
    });

    it("管理者操作の完了を記録できる", async () => {
      await expect(
        auditor.completeAdminOperation("audit-id-123", true, 1500, undefined, ["users", "events"])
      ).resolves.not.toThrow();
    });

    it("緊急アクセスの場合は疑わしい活動としても記録される", async () => {
      const logSuspiciousActivitySpy = jest.spyOn(auditor, "logSuspiciousActivity");

      await auditor.logAdminAccess(
        AdminReason.EMERGENCY_ACCESS,
        "Emergency data access",
        mockAuditContext
      );

      expect(logSuspiciousActivitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: SuspiciousActivityType.ADMIN_ACCESS_ATTEMPT,
          severity: SecuritySeverity.HIGH,
        })
      );
    });
  });

  describe("ゲストアクセス監査", () => {
    it("ゲストアクセスを正常に記録できる", async () => {
      await expect(
        auditor.logGuestAccess(
          "test-guest-token-12345678901234567890",
          "view_attendance",
          mockAuditContext,
          true,
          {
            attendanceId: "attendance-123",
            eventId: "event-456",
            tableName: "attendances",
            operationType: "SELECT",
            resultCount: 1,
          }
        )
      ).resolves.not.toThrow();
    });

    it("失敗したゲストアクセスは疑わしい活動として記録される", async () => {
      const logSuspiciousActivitySpy = jest.spyOn(auditor, "logSuspiciousActivity");

      await auditor.logGuestAccess("invalid-token", "view_attendance", mockAuditContext, false, {
        errorCode: "INVALID_TOKEN",
        errorMessage: "Token not found",
      });

      expect(logSuspiciousActivitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: SuspiciousActivityType.INVALID_TOKEN_PATTERN,
          severity: SecuritySeverity.HIGH,
        })
      );
    });
  });

  describe("疑わしい活動の検知", () => {
    it("疑わしい活動を記録できる", async () => {
      await expect(
        auditor.logSuspiciousActivity({
          activityType: SuspiciousActivityType.EMPTY_RESULT_SET,
          tableName: "attendances",
          attemptedAction: "SELECT",
          expectedResultCount: 5,
          actualResultCount: 0,
          severity: SecuritySeverity.MEDIUM,
          ipAddress: mockAuditContext.ipAddress,
          userAgent: mockAuditContext.userAgent,
          sessionId: mockAuditContext.sessionId,
          detectionMethod: "EMPTY_RESULT_SET_ANALYSIS",
        })
      ).resolves.not.toThrow();
    });

    it("空の結果セットを分析できる", async () => {
      const logSuspiciousActivitySpy = jest.spyOn(auditor, "logSuspiciousActivity");

      await auditor.analyzeEmptyResultSet(
        {
          tableName: "attendances",
          operation: "SELECT",
          expectedCount: 3,
          actualCount: 0,
          isEmpty: true,
          isUnexpectedlyEmpty: true,
          context: { query: "SELECT * FROM attendances WHERE event_id = ?" },
        },
        mockAuditContext
      );

      expect(logSuspiciousActivitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: SuspiciousActivityType.EMPTY_RESULT_SET,
          expectedResultCount: 3,
          actualResultCount: 0,
        })
      );
    });

    it("RLS違反の可能性を検知できる", async () => {
      const logSuspiciousActivitySpy = jest.spyOn(auditor, "logSuspiciousActivity");

      await auditor.detectPotentialRlsViolation(
        "attendances",
        10, // 期待される結果数
        2, // 実際の結果数（50%以下）
        mockAuditContext
      );

      expect(logSuspiciousActivitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: SuspiciousActivityType.UNAUTHORIZED_RLS_BYPASS,
          severity: SecuritySeverity.HIGH,
        })
      );
    });
  });

  describe("不正アクセス試行の記録", () => {
    it("不正アクセス試行を記録できる", async () => {
      await expect(
        auditor.logUnauthorizedAccess({
          attemptedResource: "/api/admin/users",
          requiredPermission: "admin:read",
          detectionMethod: DetectionMethod.PERMISSION_CHECK,
          userId: mockAuditContext.userId,
          ipAddress: mockAuditContext.ipAddress,
          userAgent: mockAuditContext.userAgent,
          sessionId: mockAuditContext.sessionId,
          requestPath: "/api/admin/users",
          requestMethod: "GET",
          responseStatus: 403,
        })
      ).resolves.not.toThrow();
    });

    it("権限拒否を記録できる", async () => {
      await expect(
        auditor.logPermissionDenied(
          "/api/admin/events",
          "admin:write",
          mockAuditContext,
          DetectionMethod.RLS_POLICY
        )
      ).resolves.not.toThrow();
    });
  });

  describe("統計とレポート", () => {
    it("管理者アクセス統計を取得できる", async () => {
      const timeRange = {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-31"),
      };

      const stats = await auditor.getAdminAccessStats(timeRange);

      expect(stats).toHaveProperty("totalAccess");
      expect(stats).toHaveProperty("byReason");
      expect(stats).toHaveProperty("byUser");
      expect(stats).toHaveProperty("failureRate");
    });

    it("ゲストアクセス統計を取得できる", async () => {
      const timeRange = {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-31"),
      };

      const stats = await auditor.getGuestAccessStats(timeRange);

      expect(stats).toHaveProperty("totalAccess");
      expect(stats).toHaveProperty("uniqueTokens");
      expect(stats).toHaveProperty("byAction");
      expect(stats).toHaveProperty("failureRate");
      expect(stats).toHaveProperty("topEvents");
    });

    it("セキュリティレポートを生成できる", async () => {
      const timeRange = {
        start: new Date("2024-01-01"),
        end: new Date("2024-01-31"),
      };

      const report = await auditor.generateSecurityReport(timeRange);

      expect(report).toHaveProperty("timeRange");
      expect(report).toHaveProperty("adminAccessCount");
      expect(report).toHaveProperty("guestAccessCount");
      expect(report).toHaveProperty("suspiciousActivities");
      expect(report).toHaveProperty("unauthorizedAttempts");
      expect(report).toHaveProperty("rlsViolationIndicators");
      expect(report).toHaveProperty("recommendations");
    });
  });

  describe("監査ログ管理", () => {
    it("古い監査ログをクリーンアップできる", async () => {
      const deletedCount = await auditor.cleanupOldAuditLogs(30);
      expect(typeof deletedCount).toBe("number");
    });

    it("監査ログの整合性をチェックできる", async () => {
      const result = await auditor.validateAuditLogIntegrity();

      expect(result).toHaveProperty("isValid");
      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("recommendations");
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe("エラーハンドリング", () => {
    it("データベースエラーを適切に処理する", async () => {
      // 新しいauditorインスタンスを作成してモックを適用
      const errorAuditor = new SecurityAuditorImpl();

      // プライベートプロパティにアクセスするためのハック
      (errorAuditor as any).supabase = {
        from: jest.fn(() => ({
          insert: jest.fn(() => ({ error: { message: "Database connection failed" } })),
        })),
      };

      await expect(
        errorAuditor.logAdminAccess(
          AdminReason.SYSTEM_MAINTENANCE,
          "Test operation",
          mockAuditContext
        )
      ).rejects.toThrow(AuditError);
    });

    it("無効なコンテキストでも処理を継続する", async () => {
      const invalidContext = {}; // 必要なプロパティが不足

      // 現在の実装では無効なコンテキストでもエラーを投げずに処理を継続する
      await expect(
        auditor.logAdminAccess(
          AdminReason.SYSTEM_MAINTENANCE,
          "Test operation",
          invalidContext as any
        )
      ).resolves.not.toThrow();
    });
  });
});

describe("AuditContextBuilder", () => {
  it("監査コンテキストを作成できる", () => {
    const context = createAuditContext("user-123");

    expect(context).toHaveProperty("sessionId");
    expect(context).toHaveProperty("operationStartTime");
    expect(context.userId).toBe("user-123");
  });
});
