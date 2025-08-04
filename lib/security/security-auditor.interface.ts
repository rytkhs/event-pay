/**
 * EventPay セキュリティ監査システム - インターフェース定義
 *
 * セキュリティ監査機能の抽象インターフェース
 */

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
} from "./audit-types";

// ====================================================================
// 1. メインインターフェース
// ====================================================================

/**
 * セキュリティ監査システムのメインインターフェース
 *
 * データベースアクセスの監査、セキュリティ違反の検知、
 * レポート生成機能を提供する
 */
export interface SecurityAuditor {
  // ====================================================================
  // 管理者アクセス監査
  // ====================================================================

  /**
   * 管理者権限使用を記録
   *
   * @param reason 使用理由
   * @param context 操作コンテキスト
   * @param auditContext 監査コンテキスト
   * @param operationDetails 操作詳細（オプション）
   */
  logAdminAccess(
    reason: AdminReason,
    context: string,
    auditContext: AuditContext,
    operationDetails?: Record<string, any>
  ): Promise<void>;

  /**
   * 管理者操作の完了を記録（成功/失敗、実行時間など）
   *
   * @param auditId 監査ログID
   * @param success 操作成功フラグ
   * @param durationMs 実行時間（ミリ秒）
   * @param errorMessage エラーメッセージ（失敗時）
   * @param accessedTables アクセスしたテーブル一覧
   */
  completeAdminOperation(
    auditId: string,
    success: boolean,
    durationMs?: number,
    errorMessage?: string,
    accessedTables?: string[]
  ): Promise<void>;

  // ====================================================================
  // ゲストアクセス監査
  // ====================================================================

  /**
   * ゲストトークンアクセスを記録
   *
   * @param token ゲストトークン（ハッシュ化される）
   * @param action 実行アクション
   * @param auditContext 監査コンテキスト
   * @param success 操作成功フラグ
   * @param additionalInfo 追加情報
   */
  logGuestAccess(
    token: string,
    action: string,
    auditContext: AuditContext,
    success: boolean,
    additionalInfo?: {
      attendanceId?: string;
      eventId?: string;
      tableName?: string;
      operationType?: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
      resultCount?: number;
      errorCode?: string;
      errorMessage?: string;
    }
  ): Promise<void>;

  // ====================================================================
  // 疑わしい活動の検知と記録
  // ====================================================================

  /**
   * 疑わしい活動を記録
   *
   * @param activity 疑わしい活動の詳細
   */
  logSuspiciousActivity(activity: SuspiciousActivityEntry): Promise<void>;

  /**
   * 空の結果セットを分析し、疑わしい活動として記録
   *
   * @param analysis 結果セット分析情報
   * @param auditContext 監査コンテキスト
   */
  analyzeEmptyResultSet(analysis: ResultSetAnalysis, auditContext: AuditContext): Promise<void>;

  /**
   * RLS違反の間接的指標を検知
   *
   * @param tableName テーブル名
   * @param expectedCount 期待される結果数
   * @param actualCount 実際の結果数
   * @param auditContext 監査コンテキスト
   */
  detectPotentialRlsViolation(
    tableName: string,
    expectedCount: number,
    actualCount: number,
    auditContext: AuditContext
  ): Promise<void>;

  // ====================================================================
  // 不正アクセス試行の記録
  // ====================================================================

  /**
   * 不正アクセス試行を記録
   *
   * @param entry 不正アクセス試行の詳細
   */
  logUnauthorizedAccess(entry: UnauthorizedAccessEntry): Promise<void>;

  /**
   * 権限チェック失敗を記録
   *
   * @param resource アクセス試行されたリソース
   * @param requiredPermission 必要な権限
   * @param auditContext 監査コンテキスト
   * @param detectionMethod 検知方法
   */
  logPermissionDenied(
    resource: string,
    requiredPermission: string,
    auditContext: AuditContext,
    detectionMethod: DetectionMethod
  ): Promise<void>;

  // ====================================================================
  // レポート生成
  // ====================================================================

  /**
   * セキュリティレポートを生成
   *
   * @param timeRange 対象時間範囲
   */
  generateSecurityReport(timeRange: TimeRange): Promise<SecurityReport>;

  /**
   * 事前定義された時間範囲でセキュリティレポートを生成
   *
   * @param range 事前定義された時間範囲
   */
  generateSecurityReportForRange(range: PredefinedTimeRange): Promise<SecurityReport>;

  /**
   * 管理者アクセス統計を取得
   *
   * @param timeRange 対象時間範囲
   */
  getAdminAccessStats(timeRange: TimeRange): Promise<{
    totalAccess: number;
    byReason: Record<AdminReason, number>;
    byUser: Record<string, number>;
    failureRate: number;
  }>;

  /**
   * ゲストアクセス統計を取得
   *
   * @param timeRange 対象時間範囲
   */
  getGuestAccessStats(timeRange: TimeRange): Promise<{
    totalAccess: number;
    uniqueTokens: number;
    byAction: Record<string, number>;
    failureRate: number;
    topEvents: Array<{ eventId: string; accessCount: number }>;
  }>;

  // ====================================================================
  // 監査ログ管理
  // ====================================================================

  /**
   * 古い監査ログをクリーンアップ
   *
   * @param retentionDays 保持日数（デフォルト: 90日）
   */
  cleanupOldAuditLogs(retentionDays?: number): Promise<number>;

  /**
   * 監査ログの整合性をチェック
   */
  validateAuditLogIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }>;
}

// ====================================================================
// 2. ヘルパーインターフェース
// ====================================================================

/**
 * 監査コンテキスト作成ヘルパー
 */
export interface AuditContextBuilder {
  /**
   * HTTPリクエストから監査コンテキストを作成
   *
   * @param request HTTPリクエスト
   * @param userId ユーザーID（オプション）
   * @param guestToken ゲストトークン（オプション）
   */
  fromRequest(request: Request, userId?: string, guestToken?: string): AuditContext;

  /**
   * Next.jsのヘッダーから監査コンテキストを作成
   *
   * @param headers Next.jsヘッダー
   * @param userId ユーザーID（オプション）
   * @param guestToken ゲストトークン（オプション）
   */
  fromNextHeaders(headers: Headers, userId?: string, guestToken?: string): AuditContext;

  /**
   * 基本的な監査コンテキストを作成
   *
   * @param sessionId セッションID
   * @param userId ユーザーID（オプション）
   * @param guestToken ゲストトークン（オプション）
   */
  create(sessionId: string, userId?: string, guestToken?: string): AuditContext;
}

/**
 * セキュリティ分析ヘルパー
 */
export interface SecurityAnalyzer {
  /**
   * アクセスパターンを分析
   *
   * @param timeRange 分析対象時間範囲
   */
  analyzeAccessPatterns(timeRange: TimeRange): Promise<{
    unusualPatterns: Array<{
      pattern: string;
      frequency: number;
      severity: SecuritySeverity;
      description: string;
    }>;
    recommendations: string[];
  }>;

  /**
   * 脅威レベルを評価
   *
   * @param activities 疑わしい活動一覧
   */
  assessThreatLevel(activities: SuspiciousActivityEntry[]): Promise<{
    overallThreatLevel: SecuritySeverity;
    criticalIssues: number;
    highPriorityIssues: number;
    requiresImmediateAction: boolean;
  }>;

  /**
   * RLS違反の可能性を分析
   *
   * @param timeRange 分析対象時間範囲
   */
  analyzeRlsViolationRisk(timeRange: TimeRange): Promise<{
    riskLevel: SecuritySeverity;
    suspiciousTables: string[];
    emptyResultSetFrequency: Record<string, number>;
    recommendations: string[];
  }>;
}

// ====================================================================
// 3. 設定インターフェース
// ====================================================================

/**
 * セキュリティ監査設定
 */
export interface SecurityAuditConfig {
  /** 監査ログの保持期間（日数） */
  retentionDays: number;

  /** 空の結果セット検知の閾値 */
  emptyResultSetThreshold: number;

  /** 疑わしい活動の自動検知を有効にするか */
  enableAutomaticDetection: boolean;

  /** 高優先度アラートの通知設定 */
  alertSettings: {
    enableEmailAlerts: boolean;
    emailRecipients: string[];
    enableSlackAlerts: boolean;
    slackWebhookUrl?: string;
  };

  /** パフォーマンス設定 */
  performance: {
    batchSize: number;
    maxConcurrentOperations: number;
    enableAsyncLogging: boolean;
  };
}
