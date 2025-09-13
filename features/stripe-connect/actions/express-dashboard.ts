"use server";

import { redirect } from "next/navigation";

import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";

import { createUserStripeConnectService } from "../services";

export interface ExpressDashboardResult {
  success: boolean;
  error?: string;
  loginUrl?: string;
}

/**
 * Stripe Express Dashboard ログインリンクを生成するServer Action
 * ベストプラクティス: オンデマンドでログインリンクを生成し、プラットフォーム内からのみリダイレクト
 */
export async function createExpressDashboardLoginLinkAction(): Promise<void> {
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      logger.error("Auth error in Express Dashboard login link creation", {
        tag: "expressDashboardAuthError",
        error_name: authError.name,
        error_message: authError.message,
      });
      redirect("/dashboard?error=auth_failed");
      return;
    }

    if (!user) {
      logger.warn("Unauthenticated user attempted Express Dashboard access", {
        tag: "expressDashboardUnauthenticated",
      });
      redirect("/login?redirectTo=/dashboard");
      return;
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = createUserStripeConnectService();

    // 3. 既存のConnect Accountを確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      logger.warn("No Stripe Connect account found for Express Dashboard access", {
        tag: "expressDashboardNoAccount",
        user_id: user.id,
      });
      redirect("/dashboard/connect?message=account_required");
      return;
    }

    // 4. アカウント状態を確認（Express Dashboardアクセスには最低限details_submittedが必要）
    const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

    if (accountInfo.status === "unverified") {
      logger.warn("Unverified account attempted Express Dashboard access", {
        tag: "expressDashboardUnverified",
        user_id: user.id,
        account_id: account.stripe_account_id,
      });
      redirect("/dashboard/connect?message=verification_required");
      return;
    }

    // 5. Stripe Connect Service を使用してログインリンクを生成
    const loginLink = await stripeConnectService.createLoginLink(account.stripe_account_id);

    logger.info("Express Dashboard login link created successfully", {
      tag: "expressDashboardLoginLinkCreated",
      user_id: user.id,
      account_id: account.stripe_account_id,
    });

    // 6. ログインリンクにリダイレクト（Stripeのベストプラクティス）
    redirect(loginLink.url);
  } catch (error) {
    // Next.js の redirect は例外としてスローされるため、捕捉した場合は即時再スローする
    try {
      const digest = (error as any)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        throw error as Error;
      }
    } catch {
      // 何もしない（通常のエラーハンドリングへ）
    }

    logger.error("Failed to create Express Dashboard login link", {
      tag: "expressDashboardLoginLinkError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    redirect("/dashboard?error=express_dashboard_failed");
  }
}

/**
 * Express Dashboard アクセス可能状態をチェックするServer Action
 */
export async function checkExpressDashboardAccessAction(): Promise<ExpressDashboardResult> {
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 2. StripeConnectServiceを初期化
    const stripeConnectService = createUserStripeConnectService();

    // 3. Connect Accountの確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      return {
        success: false,
        error: "Stripe Connectアカウントが設定されていません",
      };
    }

    // 4. アカウント状態の確認
    const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

    if (accountInfo.status === "unverified") {
      return {
        success: false,
        error: "Stripe Connectアカウントの認証が完了していません",
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Failed to check Express Dashboard access", {
      tag: "expressDashboardAccessCheckError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: "アクセス状態の確認に失敗しました",
    };
  }
}
