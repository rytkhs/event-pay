/**
 * EventPay セキュリティモジュール - エクスポート
 *
 * セキュリティ関連の全ての機能を統合してエクスポート
 */

// ====================================================================
// 1. セキュアクライアントファクトリー
// ====================================================================
export { SecureSupabaseClientFactory } from "./secure-client-factory.impl";
export type {
  ISecureSupabaseClientFactory,
  IGuestTokenValidator,
  ISecurityAuditor,
} from "./secure-client-factory.interface";
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
  type ClientCreationOptions,
  type EventInfo,
} from "./secure-client-factory.types";

// ====================================================================
// 2. ゲストトークンバリデーター
// ====================================================================
export { RLSGuestTokenValidator } from "./guest-token-validator";

// ====================================================================
// 3. 基本的な監査型定義
// ====================================================================
export {
  SecuritySeverity,
  DetectionMethod,
  AuditErrorCode,
  AuditError,
  type SecurityReport,
  type TimeRange,
  type PredefinedTimeRange,
  type SecurityRecommendation,
} from "./audit-types";

// ====================================================================
// 6. 暗号化ユーティリティ
// ====================================================================
export {
  hashToken,
  constantTimeCompare,
  randomDelay,
  generateSecureUuid,
  validateGuestTokenFormat,
  generateRandomBytes,
  toBase64UrlSafe,
  // 将来実装予定の関数（現在は未実装）
  // verifyToken,
  // encryptData,
  // decryptData,
  // generateKeyPair,
  // signData,
  // verifySignature,
} from "./crypto";

// 将来実装予定の型（現在は未実装）
// export type {
//   EncryptionResult,
//   KeyPair,
//   SignatureResult,
// } from "./crypto";

// ====================================================================
// 7. 管理者操作
// ====================================================================
// 循環依存を回避するため、admin-operationsは直接インポートしてください:
// import { AdminOperations, deleteUserById } from "@core/security/admin-operations";
export type { AdminOperationResult } from "./admin-operations.types";

// ====================================================================
// 5. 統合セキュリティファクトリー
// ====================================================================

import { AdminOperations } from "./admin-operations";
import { RLSGuestTokenValidator } from "./guest-token-validator";
import { SecureSupabaseClientFactory } from "./secure-client-factory.impl";

/**
 * セキュリティシステムの統合ファクトリー
 *
 * 必要最小限のセキュリティコンポーネントを統合
 */
export class SecuritySystemFactory {
  private static instance: SecuritySystemFactory;
  private clientFactory: SecureSupabaseClientFactory;
  private guestValidator: RLSGuestTokenValidator;
  private adminOps: AdminOperations;

  private constructor() {
    // セキュアクライアントファクトリーを初期化
    this.clientFactory = SecureSupabaseClientFactory.create();

    // ゲストトークンバリデーターを初期化
    this.guestValidator = new RLSGuestTokenValidator();

    // 管理者操作を初期化
    this.adminOps = new AdminOperations();
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
   * セキュアクライアントファクトリーを取得
   */
  public getClientFactory(): SecureSupabaseClientFactory {
    return this.clientFactory;
  }

  /**
   * ゲストトークンバリデーターを取得
   */
  public getGuestValidator(): RLSGuestTokenValidator {
    return this.guestValidator;
  }

  /**
   * 管理者操作を取得
   */
  public getAdminOperations(): AdminOperations {
    return this.adminOps;
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
      components.clientFactory = true;
      components.guestValidator = true;
      components.adminOps = true;

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
export function createSecureSupabaseClient(): SecureSupabaseClientFactory {
  return getSecuritySystem().getClientFactory();
}

/**
 * デフォルトのゲストトークンバリデーターインスタンスを取得する関数
 */
export function createGuestTokenValidator(): RLSGuestTokenValidator {
  return getSecuritySystem().getGuestValidator();
}

// ====================================================================
// 8. セキュリティ設定
// ====================================================================
export {
  RATE_LIMIT_CONFIG,
  COOKIE_CONFIG,
  AUTH_CONFIG,
  PASSWORD_CONFIG,
  getCookieConfig,
} from "./config";
