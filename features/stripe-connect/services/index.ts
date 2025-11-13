/**
 * StripeConnect サービスのエクスポート
 */

// サービスクラス
export { StripeConnectService } from "./service";
export { StripeConnectErrorHandler } from "./error-handler";
export { StatusSyncService, StatusSyncError, StatusSyncErrorType } from "./status-sync-service";
export type { SyncOptions } from "./status-sync-service";
export { logStatusChange } from "./audit-logger";

// インターフェース
export type { IStripeConnectService, IStripeConnectErrorHandler } from "./interface";

// エラーマッピング
export {
  ERROR_HANDLING_BY_TYPE,
  STRIPE_ERROR_CODE_MAPPING,
  POSTGRES_ERROR_CODE_MAPPING,
} from "./error-mapping";

// サービスインスタンス作成のヘルパー関数
import { type SupabaseClient } from "@supabase/supabase-js";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { Database } from "@/types/database";

import { StripeConnectErrorHandler } from "./error-handler";
import type { IStripeConnectService } from "./interface";
import { StripeConnectService } from "./service";

/**
 * 認証済みユーザー用のStripeConnectServiceを作成
 * Server Actions / サーバーコンポーネントで使用（RLS適用）
 */
export const createUserStripeConnectService = (): IStripeConnectService => {
  const secureFactory = SecureSupabaseClientFactory.create();
  const userClient = secureFactory.createAuthenticatedClient();
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(userClient as SupabaseClient<Database>, errorHandler);
};

/**
 * 監査付き管理者用のStripeConnectServiceを作成
 * Webhook / 内部処理で使用（RLSバイパス、監査ログ記録）
 */
export const createAdminStripeConnectService = async (
  reason: AdminReason,
  context: string
): Promise<IStripeConnectService> => {
  const secureFactory = SecureSupabaseClientFactory.create();
  const adminClient = await secureFactory.createAuditedAdminClient(reason, context);
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as SupabaseClient<Database>, errorHandler);
};

/**
 * 既存の管理者クライアントから StripeConnectService を作成
 * 重複した admin クライアント生成と監査ログの多重発火を避けるために使用
 */
export const createStripeConnectServiceWithClient = (
  adminClient: SupabaseClient<Database>
): IStripeConnectService => {
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as SupabaseClient<Database>, errorHandler);
};
