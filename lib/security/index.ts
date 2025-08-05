/**
 * EventPay セキュリティモジュール - エクスポート
 *
 * セキュリティ関連の全ての機能を統合してエクスポート
 */

// ====================================================================
// 1. セキュアクライアントファクトリー
// ====================================================================
export { SecureSupabaseClientImpl } from "./secure-client-factory.impl";
export type { SecureSupabaseClient } from "./secure-client-factory.interface";
export {
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
  GuestTokenErrorFactory,
  GuestTokenErrorHandler,
  ErrorSeverity,
  AdminAccessError,
  AdminAccessErrorCode,
  GuestPermission,
  type GuestSession,
  type GuestValidationResult,
  type AuditContext,
  type GuestTokenValidator,
  type ClientCreationOptions,
  type EventInfo,
  type GuestErrorContext,
} from "./secure-client-factory.types";

// ====================================================================
// 2. ゲストトークンバリデーター
// ====================================================================
export { GuestTokenValidatorImpl } from "./guest-token-validator";

// ====================================================================
// 3. セキュリティ監査システム
// ====================================================================
export { SecurityAuditorImpl } from "./security-auditor.impl";
export type { SecurityAuditor } from "./security-auditor.interface";
export {
  SuspiciousActivityType,
  SecuritySeverity,
  DetectionMethod,
  AuditErrorCode,
  AuditError,
  type AdminAccessAuditEntry,
  type GuestAccessAuditEntry,
  type SuspiciousActivityEntry,
  type UnauthorizedAccessEntry,
  type ResultSetAnalysis,
  type SecurityReport,
  type TimeRange,
  type PredefinedTimeRange,
  type SuspiciousActivitySummary,
  type UnauthorizedAttemptSummary,
  type RlsViolationIndicator,
  type SecurityRecommendation,
} from "./audit-types";

// ====================================================================
// 4. 異常検知システム
// ====================================================================
export {
  AnomalyDetectorImpl,
  type AnomalyDetector,
  type AnomalyDetectionResult,
  type AccessPatternAnalysis,
  type AnomalousPattern,
  type BaselineMetrics,
  type SuspiciousActivityTrend,
  type DetectionThresholds,
  AnomalyType,
  RlsViolationType,
  TrendDirection,
} from "./anomaly-detector";

// ====================================================================
// 5. セキュリティレポート機能
// ====================================================================
export { SecurityReporterImpl } from "./security-reporter.impl";
export type { SecurityReporter } from "./security-reporter.types";
export {
  type ComprehensiveSecurityReport,
  type AdminAccessReport,
  type GuestAccessReport,
  type ThreatAnalysisReport,
  type RlsViolationReport,
  type PeriodicSecurityReport,
  type ExportedReport,
  type ExecutiveSummary,
  type DetailedAnalysis,
  type TrendAnalysis,
  type ComplianceStatus,
  type ActionItem,
  ReportPeriod,
  ReportType,
  ExportFormat,
  ActionItemStatus,
} from "./security-reporter.types";

// ====================================================================
// 6. 暗号化ユーティリティ
// ====================================================================
export {
  generateSecureToken,
  hashToken,
  verifyToken,
  encryptData,
  decryptData,
  generateKeyPair,
  signData,
  verifySignature,
  type EncryptionResult,
  type KeyPair,
  type SignatureResult,
} from "./crypto";

// ====================================================================
// 7. 管理者操作
// ====================================================================
export {
  AdminOperations,
  type AdminOperationResult,
  type AdminOperationContext,
} from "./admin-operations";

// ====================================================================
// 8. 統合セキュリティファクトリー
// ====================================================================

import { SecurityAuditorImpl } from "./security-auditor.impl";
import { SecureSupabaseClientImpl } from "./secure-client-factory.impl";
import { GuestTokenValidatorImpl } from "./guest-token-validator";
import { AdminOperations } from "./admin-operations";
import { AnomalyDetectorImpl } from "./anomaly-detector";
import { SecurityReporterImpl } from "./security-reporter.impl";

/**
 * セキュリティシステムの統合ファクトリー
 *
 * 全てのセキュリティコンポーネントを統合し、
 * 一元的な設定と初期化を提供する
 */
export class SecuritySystemFactory {
  private static instance: SecuritySystemFactory;
  private auditor: SecurityAuditorImpl;
  private clientFactory: SecureSupabaseClientImpl;
  private guestValidator: GuestTokenValidatorImpl;
  private adminOps: AdminOperations;
  private anomalyDetector: AnomalyDetectorImpl;
  private reporter: SecurityReporterImpl;

  private constructor() {
    // セキュリティ監査システムを初期化
    this.auditor = new SecurityAuditorImpl();

    // セキュアクライアントファクトリーを初期化
    this.clientFactory = new SecureSupabaseClientImpl(this.auditor);

    // ゲストトークンバリデーターを初期化
    this.guestValidator = new GuestTokenValidatorImpl(this.clientFactory);

    // 管理者操作を初期化
    this.adminOps = new AdminOperations(this.clientFactory, this.auditor);

    // 異常検知システムを初期化
    this.anomalyDetector = new AnomalyDetectorImpl(this.auditor);

    // セキュリティレポーターを初期化
    this.reporter = new SecurityReporterImpl(this.auditor, this.anomalyDetector);
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): SecuritySystemFactory {
    if (!SecuritySystemFactory.instance) {
      SecuritySystemFactory.instance = new SecuritySystemFactory();
    }
    return SecuritySystemFactory.instance;
  }

  /**
   * セキュリティ監査システムを取得
   */
  public getAuditor(): SecurityAuditorImpl {
    return this.auditor;
  }

  /**
   * セキュアクライアントファクトリーを取得
   */
  public getClientFactory(): SecureSupabaseClientImpl {
    return this.clientFactory;
  }

  /**
   * ゲストトークンバリデーターを取得
   */
  public getGuestValidator(): GuestTokenValidatorImpl {
    return this.guestValidator;
  }

  /**
   * 管理者操作を取得
   */
  public getAdminOperations(): AdminOperations {
    return this.adminOps;
  }

  /**
   * 異常検知システムを取得
   */
  public getAnomalyDetector(): AnomalyDetectorImpl {
    return this.anomalyDetector;
  }

  /**
   * セキュリティレポーターを取得
   */
  public getReporter(): SecurityReporterImpl {
    return this.reporter;
  }

  /**
   * システム全体の健全性チェック
   */
  public async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    components: Record<string, boolean>;
    issues: string[];
  }> {
    const components: Record<string, boolean> = {};
    const issues: string[] = [];

    try {
      // 各コンポーネントの健全性をチェック
      components.auditor = true; // 実際の実装では詳細チェック
      components.clientFactory = true;
      components.guestValidator = true;
      components.adminOps = true;
      components.anomalyDetector = true;
      components.reporter = true;

      const healthyComponents = Object.values(components).filter(Boolean).length;
      const totalComponents = Object.keys(components).length;

      let status: "healthy" | "degraded" | "unhealthy";
      if (healthyComponents === totalComponents) {
        status = "healthy";
      } else if (healthyComponents > totalComponents / 2) {
        status = "degraded";
      } else {
        status = "unhealthy";
      }

      return { status, components, issues };
    } catch (error) {
      issues.push(`Health check failed: ${error}`);
      return {
        status: "unhealthy",
        components,
        issues,
      };
    }
  }
}

/**
 * デフォルトのセキュリティシステムファクトリーインスタンスを取得する関数
 */
export function getSecuritySystem(): SecuritySystemFactory {
  return SecuritySystemFactory.getInstance();
}

/**
 * デフォルトのセキュアクライアントファクトリーインスタンスを取得する関数
 */
export function createSecureSupabaseClient(): SecureSupabaseClientImpl {
  return getSecuritySystem().getClientFactory();
}

/**
 * デフォルトのゲストトークンバリデーターインスタンスを取得する関数
 */
export function createGuestTokenValidator(): GuestTokenValidatorImpl {
  return getSecuritySystem().getGuestValidator();
}
