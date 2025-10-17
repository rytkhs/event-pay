"use server";

import { redirect } from "next/navigation";

import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import { isNextRedirectError } from "@core/utils/next";

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

    // 4. アカウント状態を確認
    const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

    // Expressダッシュボードのログインリンクはオンボーディング未完了では作成不可のため、verifiedに限定
    if (accountInfo.status !== "verified") {
      const statusTagMap: Record<string, string> = {
        unverified: "expressDashboardUnverified",
        onboarding: "expressDashboardOnboarding",
        restricted: "expressDashboardRestricted",
      };

      const messageMap: Record<string, string> = {
        unverified: "verification_required",
        onboarding: "onboarding_required",
        restricted: "account_restricted",
      };

      const status = accountInfo.status as keyof typeof statusTagMap;

      logger.warn("Non-verified account attempted Express Dashboard access", {
        tag: statusTagMap[status] ?? "expressDashboardAccessDenied",
        user_id: user.id,
        account_id: account.stripe_account_id,
        status: accountInfo.status,
      });
      redirect(`/dashboard/connect?message=${messageMap[status] ?? "onboarding_required"}`);
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
    // redirect 例外はそのまま再スロー（エラー扱いしない）
    if (isNextRedirectError(error)) {
      throw error as Error;
    }

    logger.error("Failed to create Express Dashboard login link", {
      tag: "expressDashboardLoginLinkError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    // 失敗時は接続設定ページへ誘導
    redirect("/dashboard/connect?message=express_dashboard_failed");
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

    // Expressダッシュボード表示は verified 限定
    if (accountInfo.status !== "verified") {
      let errorMessage = "Stripe Connectアカウントの設定が完了していません";
      if (accountInfo.status === "unverified") {
        errorMessage = "Stripe Connectアカウントの認証が未完了です";
      } else if (accountInfo.status === "onboarding") {
        errorMessage = "Stripe Connectのオンボーディングを完了してください";
      } else if (accountInfo.status === "restricted") {
        errorMessage = "Stripe Connectアカウントに制限があります";
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    return { success: true };
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
