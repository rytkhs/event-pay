/**
 * EventPay セキュリティモジュール - エクスポートインデックス
 * 
 * セキュアクライアントファクトリーと関連機能の統一エクスポート
 */

// 型定義
export * from './secure-client-factory.types';
export * from './secure-client-factory.interface';

// 実装
export {
  SecureSupabaseClientFactory,
  RLSBasedGuestValidator,
  getSecureClientFactory,
  getGuestTokenValidator
} from './secure-client-factory.impl';

// セキュリティ監査
export { SecurityAuditorImpl } from './security-auditor.impl';

// 便利な関数
export {
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
  AdminAccessError,
  AdminAccessErrorCode,
  GuestPermission
} from './secure-client-factory.types';

/**
 * デフォルトのセキュアクライアントファクトリーインスタンスを取得する関数
 */
export function createSecureSupabaseClient() {
  return getSecureClientFactory();
}

/**
 * デフォルトのゲストトークンバリデーターインスタンスを取得する関数
 */
export function createGuestTokenValidator() {
  return getGuestTokenValidator();
}