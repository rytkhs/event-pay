import { revalidatePath } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { fail, ok } from "@core/errors/adapters/server-actions";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { accountDeletionRequestSchema } from "@core/validation/settings";

/**
 * アカウント削除（Supabase Authのソフトデリート機能を使用）
 * - auth.users: shouldSoftDelete=trueでソフトデリート（個人情報難読化、deleted_at設定）
 * - public.users: is_deleted=trueで論理削除
 * - Stripe Connect: 無効化（best-effort）
 */
export async function requestAccountDeletionAction(formData: FormData): Promise<ActionResult> {
  try {
    // 認証
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 入力検証
    const raw = {
      confirmText: (formData.get("confirmText") as string) ?? "",
      agreeIrreversible: formData.get("agreeIrreversible")?.toString() as "on" | undefined,
      agreeFinanceRetention: formData.get("agreeFinanceRetention")?.toString() as "on" | undefined,
      agreeStripeDisable: formData.get("agreeStripeDisable")?.toString() as "on" | undefined,
    };
    const parsed = accountDeletionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: parsed.error.errors.map((e) => e.message).join(", "),
      });
    }

    const supabase = await createServerActionSupabaseClient();

    // 1. Supabase Authのソフトデリート機能を使用
    const admin = await createAuditedAdminClient(
      AdminReason.ACCOUNT_DELETION,
      `User soft deletion: ${user.id}`,
      {
        userId: user.id,
        operationType: "DELETE",
        accessedTables: ["auth.users", "public.users", "public.line_accounts"],
      }
    );

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
    if (deleteError) {
      handleServerError(deleteError, {
        category: "authentication",
        action: "account_deletion",
        actorType: "user",
        userId: user.id,
      });
      return fail("ACCOUNT_DELETION_UNEXPECTED_ERROR", {
        userMessage: "アカウントの処理に失敗しました",
      });
    }

    // 2. Stripe Connect 無効化（可能範囲）: DB上の状態を未検証でも無効化（best-effort）
    try {
      // features adaptersの自動登録はサーバ環境で副作用import済み
      const { getStripeConnectPort } = await import("@core/ports/stripe-connect");
      const port = getStripeConnectPort();
      await port.updateAccountStatus({
        userId: user.id,
        status: "unverified",
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    } catch (e) {
      logger.warn("Stripe disable best-effort failed", {
        category: "authentication",
        action: "account_deletion",
        actor_type: "user",
        user_id: user.id,
        error_message: e instanceof Error ? e.message : String(e),
        outcome: "failure",
      });
    }

    // 3. 論理削除: public.users の is_deleted フラグを設定
    const { error: anonError } = await supabase
      .from("users")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        name: "退会ユーザー",
        email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (anonError) {
      handleServerError(anonError, {
        category: "authentication",
        action: "account_deletion",
        actorType: "user",
        userId: user.id,
      });
      return fail("ACCOUNT_DELETION_UNEXPECTED_ERROR", {
        userMessage: "アカウントの処理に失敗しました",
      });
    }

    // 4. 物理削除: line_accounts の個人情報を完全削除
    const { error: lineAccountError } = await admin
      .from("line_accounts")
      .delete()
      .eq("auth_user_id", user.id);
    if (lineAccountError) {
      handleServerError(lineAccountError, {
        category: "authentication",
        action: "account_deletion",
        actorType: "user",
        userId: user.id,
      });
      return fail("ACCOUNT_DELETION_UNEXPECTED_ERROR", {
        userMessage: "アカウントの処理に失敗しました",
      });
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      logger.warn("Account deletion sign-out failed", {
        category: "authentication",
        action: "account_deletion",
        actor_type: "user",
        user_id: user.id,
        error_message: signOutError.message,
        outcome: "failure",
      });
    }

    // キャッシュ無効化 & 強制ログアウト導線
    revalidatePath("/settings/profile");
    revalidatePath("/dashboard");

    return ok(undefined, {
      message: "アカウントの削除処理が完了しました。ログインページに移動します。",
      redirectUrl: "/login",
    });
  } catch (error) {
    handleServerError("ACCOUNT_DELETION_UNEXPECTED_ERROR", {
      category: "authentication",
      action: "account_deletion",
      actorType: "user",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return fail("ACCOUNT_DELETION_UNEXPECTED_ERROR", {
      userMessage: "処理中にエラーが発生しました",
    });
  }
}
