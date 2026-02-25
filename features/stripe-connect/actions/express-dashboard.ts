import { redirect } from "next/navigation";

import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { isNextRedirectError } from "@core/utils/next";

import { createUserStripeConnectServiceForServerAction } from "../services/factories";
import type { ExpressDashboardAccessPayload } from "../types";

/**
 * Stripe Express Dashboard ログインリンクを生成するServer Action
 * ベストプラクティス: オンデマンドでログインリンクを生成し、プラットフォーム内からのみリダイレクト
 */
export async function createExpressDashboardLoginLinkAction(): Promise<void> {
  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const supabase = await createServerActionSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    userId = user?.id;

    if (authError) {
      handleServerError(authError, {
        category: "stripe_connect",
        action: "create_express_dashboard_login_link_auth_failed",
        userId,
      });
      redirect("/settings/payments?error=auth_failed");
      return;
    }

    if (!user) {
      logger.warn("Unauthenticated user attempted Express Dashboard access", {
        category: "stripe_connect",
        action: "login_link_creation",
        actor_type: "anonymous",
        outcome: "failure",
      });
      redirect("/login?redirectTo=/dashboard");
      return;
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = await createUserStripeConnectServiceForServerAction();

    // 3. 既存のConnect Accountを確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      logger.warn("No Stripe Connect account found for Express Dashboard access", {
        category: "stripe_connect",
        action: "login_link_creation",
        actor_type: "user",
        user_id: user.id,
        outcome: "failure",
      });
      redirect("/settings/payments?message=account_required");
      return;
    }

    // 4. Stripe Connect Service を使用してログインリンクを生成
    const loginLink = await stripeConnectService.createLoginLink(account.stripe_account_id);

    logger.info("Express Dashboard login link created successfully", {
      category: "stripe_connect",
      action: "login_link_creation",
      actor_type: "user",
      user_id: user.id,
      account_id: account.stripe_account_id,
      outcome: "success",
    });

    // 6. ログインリンクにリダイレクト（Stripeのベストプラクティス）
    redirect(loginLink.url);
  } catch (error) {
    // redirect 例外はそのまま再スロー（エラー扱いしない）
    if (isNextRedirectError(error)) {
      throw error as Error;
    }

    handleServerError(error, {
      category: "stripe_connect",
      action: "create_express_dashboard_login_link_failed",
      userId,
    });

    // 失敗時は接続設定ページへ誘導
    redirect("/settings/payments?message=express_dashboard_failed");
  }
}

/**
 * Express Dashboard アクセス可能状態をチェックするServer Action
 */
export async function checkExpressDashboardAccessAction(): Promise<
  ActionResult<ExpressDashboardAccessPayload>
> {
  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const supabase = await createServerActionSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    userId = user?.id;

    if (authError || !user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = await createUserStripeConnectServiceForServerAction();

    // 3. Connect Accountの確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      return ok({
        hasAccount: false,
      });
    }

    return ok({
      hasAccount: true,
      accountId: account.stripe_account_id,
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    // デバッグログ: エラーの詳細情報を出力
    handleServerError(error, {
      category: "stripe_connect",
      action: "check_express_dashboard_access_failed",
      userId,
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "アクセス状態の確認に失敗しました",
    });
  }
}
