import { getSecureClientFactory } from "@/lib/security";
import { AdminReason } from "@/lib/security/secure-client-factory.types";

/**
 * セキュアな管理者操作ユーティリティ
 * 
 * 従来のlib/supabase/admin.tsを置き換える新しい実装
 * - 監査機能付きの管理者権限使用
 * - AdminReasonエナムによる使用理由の明示
 * - セキュリティログの自動記録
 */

/**
 * ユーザー削除（補償トランザクション用）
 * 
 * @param userId 削除対象のユーザーID
 * @param reason 削除理由（監査用）
 * @param context 削除の詳細コンテキスト
 */
export async function deleteUserById(
  userId: string,
  reason: AdminReason = AdminReason.USER_CLEANUP,
  context: string = "User deletion for compensation transaction"
): Promise<void> {
  const secureFactory = getSecureClientFactory();
  const adminClient = await secureFactory.createAuditedAdminClient(reason, context);

  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }
}

/**
 * ユーザーのpublic.usersレコード存在確認
 * 
 * @param userId 確認対象のユーザーID
 * @param reason 確認理由（監査用）
 * @param context 確認の詳細コンテキスト
 * @returns ユーザープロファイルが存在するかどうか
 */
export async function checkUserProfileExists(
  userId: string,
  reason: AdminReason = AdminReason.SYSTEM_MAINTENANCE,
  context: string = "User profile existence check"
): Promise<boolean> {
  const secureFactory = getSecureClientFactory();
  const adminClient = await secureFactory.createAuditedAdminClient(reason, context);

  const { data, error } = await adminClient
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = No rows returned
    throw new Error(`Failed to check user profile: ${error.message}`);
  }

  return !!data;
}

/**
 * 緊急時のユーザーアクセス（緊急対応用）
 * 
 * @param userId 対象ユーザーID
 * @param emergencyReason 緊急対応の理由
 * @returns 管理者クライアント（緊急時のみ使用）
 */
export async function createEmergencyAdminClient(
  userId: string,
  emergencyReason: string
) {
  const secureFactory = getSecureClientFactory();
  return await secureFactory.createAuditedAdminClient(
    AdminReason.EMERGENCY_ACCESS,
    `Emergency access for user ${userId}: ${emergencyReason}`
  );
}

/**
 * システムメンテナンス用の管理者クライアント作成
 * 
 * @param maintenanceTask メンテナンスタスクの説明
 * @returns 管理者クライアント（メンテナンス用）
 */
export async function createMaintenanceAdminClient(maintenanceTask: string) {
  const secureFactory = getSecureClientFactory();
  return await secureFactory.createAuditedAdminClient(
    AdminReason.SYSTEM_MAINTENANCE,
    `System maintenance: ${maintenanceTask}`
  );
}

// ====================================================================
// 移行情報
// ====================================================================

/**
 * このファイルは lib/supabase/admin.ts を置き換える新しい実装です。
 * 
 * 主な改善点:
 * - 全ての管理者権限使用が監査される
 * - AdminReasonエナムで使用理由を明示
 * - セキュリティログの自動記録
 * - より細かい権限制御
 * 
 * 移行ガイド:
 * 
 * Before:
 * ```typescript
 * import { deleteUserById } from "@/lib/supabase/admin";
 * await deleteUserById(userId);
 * ```
 * 
 * After:
 * ```typescript
 * import { deleteUserById } from "@/lib/security/admin-operations";
 * await deleteUserById(userId, AdminReason.USER_CLEANUP, "Specific reason");
 * ```
 * 
 * 新機能:
 * - createEmergencyAdminClient() - 緊急時のアクセス
 * - createMaintenanceAdminClient() - メンテナンス用アクセス
 * - 全操作の監査ログ記録
 */