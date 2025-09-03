import type { NextRequest, NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AdminReason,
  AuditContext,
  ClientCreationOptions,
  GuestValidationResult,
  GuestSession,
} from "./secure-client-factory.types";

/**
 * セキュアSupabaseクライアントファクトリーのインターフェース
 *
 * このインターフェースは最小権限原則に基づいて設計されており、
 * 各種クライアントの作成時に適切な権限制御と監査機能を提供します。
 */
export interface ISecureSupabaseClientFactory {
  /**
   * 通常の認証済みクライアントを作成
   *
   * @param options クライアント作成オプション
   * @returns 認証済みSupabaseクライアント
   */
  createAuthenticatedClient(options?: ClientCreationOptions): SupabaseClient;

  /**
   * ゲストトークン認証クライアントを作成
   *
   * X-Guest-Tokenヘッダーを自動設定し、RLSポリシーベースの
   * アクセス制御を透過的に実現します。
   *
   * @param token ゲストトークン（32文字の英数字）
   * @param options クライアント作成オプション
   * @returns ゲスト用Supabaseクライアント
   * @throws GuestTokenError トークンが無効な場合
   */
  createGuestClient(token: string, options?: ClientCreationOptions): SupabaseClient;

  /**
   * 監査付き管理者クライアントを作成
   *
   * 管理者権限の使用を記録し、適切な理由と共に監査ログに記録します。
   *
   * @param reason 管理者権限使用理由
   * @param context 使用コンテキスト（詳細な説明）
   * @param auditContext 監査情報
   * @param options クライアント作成オプション
   * @returns 監査付き管理者クライアント
   * @throws AdminAccessError 不正な理由や監査ログ失敗の場合
   */
  createAuditedAdminClient(
    reason: AdminReason,
    context: string,
    auditContext?: AuditContext,
    options?: ClientCreationOptions
  ): Promise<SupabaseClient>;

  /**
   * 読み取り専用クライアントを作成
   *
   * 読み取り操作のみに制限されたクライアントを作成します。
   *
   * @param options クライアント作成オプション
   * @returns 読み取り専用Supabaseクライアント
   */
  createReadOnlyClient(options?: ClientCreationOptions): SupabaseClient;

  /**
   * ミドルウェア用クライアントを作成
   *
   * Next.jsミドルウェア内でのクッキー操作に対応したクライアントを作成します。
   *
   * @param request NextRequest オブジェクト
   * @param response NextResponse オブジェクト
   * @param options クライアント作成オプション
   * @returns ミドルウェア用Supabaseクライアント
   */
  createMiddlewareClient(
    request: NextRequest,
    response: NextResponse,
    options?: ClientCreationOptions
  ): SupabaseClient;

  /**
   * ブラウザ用クライアントを作成
   *
   * クライアントサイドでの使用に最適化されたクライアントを作成します。
   *
   * @param options クライアント作成オプション
   * @returns ブラウザ用Supabaseクライアント
   */
  createBrowserClient(options?: ClientCreationOptions): SupabaseClient;
}

/**
 * ゲストトークンバリデーターのインターフェース
 *
 * RLSポリシーベースのトークン検証を提供し、
 * 管理者権限を使用しない安全なアクセス制御を実現します。
 */
export interface IGuestTokenValidator {
  /**
   * ゲストトークンを検証
   *
   * RLSポリシーを使用してトークンの有効性を確認し、
   * 関連する参加情報とイベント情報を取得します。
   *
   * @param token ゲストトークン
   * @returns 検証結果
   */
  validateToken(token: string): Promise<GuestValidationResult>;

  /**
   * ゲストセッションを作成
   *
   * 検証済みのトークンからゲストセッション情報を作成します。
   *
   * @param token ゲストトークン
   * @returns ゲストセッション情報
   */
  createGuestSession(token: string): Promise<GuestSession>;

  /**
   * 変更権限をチェック
   *
   * イベントの開始時刻と登録締切を確認し、
   * ゲストが参加情報を変更可能かどうかを判定します。
   *
   * @param token ゲストトークン
   * @returns 変更可能かどうか
   */
  checkModificationPermissions(token: string): Promise<boolean>;

  /**
   * トークンの基本フォーマットを検証
   *
   * トークンの長さと文字種をチェックします。
   *
   * @param token ゲストトークン
   * @returns フォーマットが有効かどうか
   */
  validateTokenFormat(token: string): boolean;
}

/**
 * セキュリティ監査機能のインターフェース
 *
 * 管理者権限の使用やゲストアクセスを監査し、
 * セキュリティインシデントの検出と対応を支援します。
 */
export interface ISecurityAuditor {
  /**
   * 管理者アクセスをログに記録
   *
   * @param reason 使用理由
   * @param context 使用コンテキスト
   * @param auditContext 監査情報
   * @param operationDetails 操作詳細
   */
  logAdminAccess(
    reason: AdminReason,
    context: string,
    auditContext: AuditContext,
    operationDetails?: Record<string, unknown>
  ): Promise<void>;

  /**
   * ゲストアクセスをログに記録
   *
   * @param token ゲストトークン（ハッシュ化して記録）
   * @param action 実行されたアクション
   * @param auditContext 監査情報
   * @param success 成功/失敗
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

  /**
   * 疑わしい活動をログに記録
   *
   * @param activity 疑わしい活動の詳細
   */
  logSuspiciousActivity(activity: {
    activityType: string;
    tableName?: string;
    userRole?: string;
    userId?: string;
    attemptedAction?: string;
    expectedResultCount?: number;
    actualResultCount?: number;
    context?: Record<string, unknown>;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    detectionMethod?: string;
    falsePositive?: boolean;
    investigatedAt?: Date;
    investigatedBy?: string;
    investigationNotes?: string;
    createdAt?: Date;
  }): Promise<void>;
}
