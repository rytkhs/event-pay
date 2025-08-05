/**
 * EventPay セキュリティモジュール - エクスポートインデックス
 *
 * セキュアクライアントファクトリーと関連機能の統一エクスポート
 */

// 型定義
export * from "./secure-client-factory.types";
export * from "./secure-client-factory.interface";

// 実装
export {
  SecureSupabaseClientFactory,
  RLSBasedGuestValidator,
  getSecureClientFactory,
  getGuestTokenValidator,
} from "./secure-client-factory.impl";

// ゲストトークンバリデーター
export {
  RLSGuestTokenValidator,
  getRLSGuestTokenValidator,
  validateGuestTokenRLS,
  type RLSGuestAttendanceData,
  type RLSGuestTokenValidationResult,
} from "./guest-token-validator";

// エラーハンドリング
export {
  GuestTokenErrorFactory,
  GuestTokenErrorHandler,
  GuestTokenErrorCollector,
  ErrorSeverity,
  type GuestErrorContext,
  type ErrorStatistics,
} from "./guest-token-errors";

// セキュリティ監査
export { SecurityAuditorImpl } from "./security-auditor.impl";

// 管理者操作（セキュア）
export {
  deleteUserById,
  checkUserProfileExists,
  createEmergencyAdminClient,
  createMaintenanceAdminClient,
} from "./admin-operations";

// 便利な関数
export {
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
  AdminAccessError,
  AdminAccessErrorCode,
  GuestPermission,
} from "./secure-client-factory.types";

export type { EventInfo } from "./secure-client-factory.types";

/**
 * デフォルトのセキュアクライアントファクトリーインスタンスを取得する関数
 */
export function createSecureSupabaseClient() {
  return SecureSupabaseClientFactory.getInstance();
}

/**
 * デフォルトのゲストトークンバリデーターインスタンスを取得する関数
 */
export function createGuestTokenValidator() {
  return new RLSGuestTokenValidator();
}
