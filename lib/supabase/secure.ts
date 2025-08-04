/**
 * EventPay セキュアSupabaseクライアント - 移行ヘルパー
 *
 * 既存のSupabaseクライアント作成を新しいセキュアファクトリーに移行するためのヘルパー関数
 * 段階的な移行を可能にし、後方互換性を保持
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import {
  secureClientFactory,
  guestTokenValidator,
  AdminReason,
  AuditContext,
  ClientCreationOptions,
} from "@/lib/security";

/**
 * セキュア認証済みクライアントを作成
 * 既存のcreateSupabaseServerClient()の置き換え
 */
export function createSecureAuthenticatedClient(options?: ClientCreationOptions): SupabaseClient {
  return secureClientFactory.createAuthenticatedClient(options);
}

/**
 * セキュアゲストクライアントを作成
 * ゲストトークンによる透過的なアクセス制御を提供
 */
export function createSecureGuestClient(
  token: string,
  options?: ClientCreationOptions
): SupabaseClient {
  return secureClientFactory.createGuestClient(token, options);
}

/**
 * セキュア管理者クライアントを作成（監査付き）
 * 管理者権限の使用を記録し、適切な理由と共に監査ログに記録
 */
export async function createSecureAdminClient(
  reason: AdminReason,
  context: string,
  auditContext?: AuditContext,
  options?: ClientCreationOptions
): Promise<SupabaseClient> {
  return secureClientFactory.createAuditedAdminClient(reason, context, auditContext, options);
}

/**
 * セキュア読み取り専用クライアントを作成
 */
export function createSecureReadOnlyClient(options?: ClientCreationOptions): SupabaseClient {
  return secureClientFactory.createReadOnlyClient(options);
}

/**
 * セキュアミドルウェアクライアントを作成
 */
export function createSecureMiddlewareClient(
  request: NextRequest,
  response: NextResponse,
  options?: ClientCreationOptions
): SupabaseClient {
  return secureClientFactory.createMiddlewareClient(request, response, options);
}

/**
 * セキュアブラウザクライアントを作成
 */
export function createSecureBrowserClient(options?: ClientCreationOptions): SupabaseClient {
  return secureClientFactory.createBrowserClient(options);
}

/**
 * ゲストトークンを検証
 */
export async function validateGuestToken(token: string) {
  return guestTokenValidator.validateToken(token);
}

/**
 * ゲストセッションを作成
 */
export async function createGuestSession(token: string) {
  return guestTokenValidator.createGuestSession(token);
}

/**
 * ゲストの変更権限をチェック
 */
export async function checkGuestModificationPermissions(token: string) {
  return guestTokenValidator.checkModificationPermissions(token);
}

// 後方互換性のためのエイリアス（段階的移行用）

/**
 * @deprecated Use createSecureAuthenticatedClient instead
 * 既存コードとの互換性のための一時的なエイリアス
 */
export const createSupabaseServerClient = createSecureAuthenticatedClient;

/**
 * @deprecated Use createSecureAuthenticatedClient instead
 * 既存コードとの互換性のための一時的なエイリアス
 */
export const createClient = createSecureAuthenticatedClient;

/**
 * 管理者権限が必要な操作のヘルパー関数
 */
export class AdminOperationHelper {
  /**
   * テストデータセットアップ用の管理者クライアント
   */
  static async createTestDataClient(
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient> {
    return createSecureAdminClient(AdminReason.TEST_DATA_SETUP, context, auditContext);
  }

  /**
   * ユーザークリーンアップ用の管理者クライアント
   */
  static async createUserCleanupClient(
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient> {
    return createSecureAdminClient(AdminReason.USER_CLEANUP, context, auditContext);
  }

  /**
   * システムメンテナンス用の管理者クライアント
   */
  static async createMaintenanceClient(
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient> {
    return createSecureAdminClient(AdminReason.SYSTEM_MAINTENANCE, context, auditContext);
  }

  /**
   * 緊急アクセス用の管理者クライアント
   */
  static async createEmergencyClient(
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient> {
    return createSecureAdminClient(AdminReason.EMERGENCY_ACCESS, context, auditContext);
  }

  /**
   * セキュリティ調査用の管理者クライアント
   */
  static async createSecurityInvestigationClient(
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient> {
    return createSecureAdminClient(AdminReason.SECURITY_INVESTIGATION, context, auditContext);
  }

  /**
   * データ移行用の管理者クライアント
   */
  static async createDataMigrationClient(
    context: string,
    auditContext?: AuditContext
  ): Promise<SupabaseClient> {
    return createSecureAdminClient(AdminReason.DATA_MIGRATION, context, auditContext);
  }
}

/**
 * ゲスト操作のヘルパー関数
 */
export class GuestOperationHelper {
  /**
   * ゲストトークンの基本フォーマットを検証
   */
  static validateTokenFormat(token: string): boolean {
    return guestTokenValidator.validateTokenFormat(token);
  }

  /**
   * ゲストアクセス用のクライアントを安全に作成
   * トークン検証を含む
   */
  static async createValidatedGuestClient(
    token: string,
    options?: ClientCreationOptions
  ): Promise<{ client: SupabaseClient; isValid: boolean; canModify: boolean }> {
    const validation = await validateGuestToken(token);

    if (!validation.isValid) {
      throw new Error(`Invalid guest token: ${validation.errorCode}`);
    }

    const client = createSecureGuestClient(token, options);

    return {
      client,
      isValid: validation.isValid,
      canModify: validation.canModify,
    };
  }
}
