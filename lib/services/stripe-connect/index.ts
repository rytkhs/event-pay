/**
 * StripeConnect サービスのエクスポート
 */

// サービスクラス
export { StripeConnectService } from "./service";
export { StripeConnectErrorHandler } from "./error-handler";

// インターフェース
export type { IStripeConnectService, IStripeConnectErrorHandler } from "./interface";

// 型定義
export type {
  StripeConnectAccount,
  StripeAccountStatus,
  CreateExpressAccountParams,
  CreateExpressAccountResult,
  CreateAccountLinkParams,
  CreateAccountLinkResult,
  AccountInfo,
  UpdateAccountStatusParams,
  ErrorHandlingResult,
} from "./types";

// エラー関連
export { StripeConnectError, StripeConnectErrorType } from "./types";

// バリデーション関数
export {
  validateCreateExpressAccountParams,
  validateCreateAccountLinkParams,
  validateUpdateAccountStatusParams,
  validateStripeAccountId,
  validateUserId,
} from "./validation";

// エラーマッピング
export {
  ERROR_HANDLING_BY_TYPE,
  STRIPE_ERROR_CODE_MAPPING,
  POSTGRES_ERROR_CODE_MAPPING,
} from "./error-mapping";

// サービスインスタンス作成のヘルパー関数
import { StripeConnectService } from "./service";
import { StripeConnectErrorHandler } from "./error-handler";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

/**
 * 認証済みユーザー用のStripeConnectServiceを作成
 * Server Actions / サーバーコンポーネントで使用（RLS適用）
 */
export const createUserStripeConnectService = (): StripeConnectService => {
  const secureFactory = SecureSupabaseClientFactory.getInstance();
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
): Promise<StripeConnectService> => {
  const secureFactory = SecureSupabaseClientFactory.getInstance();
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
): StripeConnectService => {
  const errorHandler = new StripeConnectErrorHandler();
  return new StripeConnectService(adminClient as SupabaseClient<Database>, errorHandler);
};
