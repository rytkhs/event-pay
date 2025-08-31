import { AdminReason } from "./secure-client-factory.types";
import type { AdminOperationResult } from "./admin-operations.types";
import { SecureSupabaseClientFactory } from "./secure-client-factory.impl";

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
): Promise<AdminOperationResult<void>> {
  try {
    // 直接インポートを使用（循環依存を解消）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(reason, context);

    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
      return {
        success: false,
        error: `Failed to delete user: ${error.message}`,
        timestamp: new Date(),
      };
    }

    return {
      success: true,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      timestamp: new Date(),
    };
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
): Promise<AdminOperationResult<boolean>> {
  try {
    // 直接インポートを使用（循環依存を解消）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(reason, context);

    const { data, error } = await adminClient.from("users").select("id").eq("id", userId).maybeSingle();

    if (error) {
      return {
        success: false,
        error: `Failed to check user profile: ${error.message}`,
        timestamp: new Date(),
      };
    }

    return {
      success: true,
      data: !!data,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      timestamp: new Date(),
    };
  }
}

/**
 * 緊急時のユーザーアクセス（緊急対応用）
 *
 * @param userId 対象ユーザーID
 * @param emergencyReason 緊急対応の理由
 * @returns 管理者クライアント（緊急時のみ使用）
 */
export async function createEmergencyAdminClient(userId: string, emergencyReason: string) {
  // 直接インポートを使用（循環依存を解消）
  const secureFactory = SecureSupabaseClientFactory.getInstance();
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
  // 直接インポートを使用（循環依存を解消）
  const secureFactory = SecureSupabaseClientFactory.getInstance();
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
/**
 *
 管理者操作クラス
 *
 * 関数群をクラスとしてラップし、統一されたインターフェースを提供
 */
export class AdminOperations {
  /**
   * ユーザー削除（補償トランザクション用）
   */
  async deleteUser(
    userId: string,
    reason: AdminReason = AdminReason.USER_CLEANUP,
    context: string = "User deletion for compensation transaction"
  ): Promise<AdminOperationResult<void>> {
    return deleteUserById(userId, reason, context);
  }

  /**
   * ユーザープロファイル存在確認
   */
  async checkUserExists(
    userId: string,
    reason: AdminReason = AdminReason.SYSTEM_MAINTENANCE,
    context: string = "User profile existence check"
  ): Promise<AdminOperationResult<boolean>> {
    return checkUserProfileExists(userId, reason, context);
  }

  /**
   * 緊急時の管理者クライアント作成
   */
  async createEmergencyClient(userId: string, emergencyReason: string) {
    return createEmergencyAdminClient(userId, emergencyReason);
  }

  /**
   * メンテナンス用の管理者クライアント作成
   */
  async createMaintenanceClient(maintenanceTask: string) {
    return createMaintenanceAdminClient(maintenanceTask);
  }
}
