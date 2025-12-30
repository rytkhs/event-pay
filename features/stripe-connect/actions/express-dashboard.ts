"use server";

import { redirect } from "next/navigation";

import Stripe from "stripe";

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
        category: "stripe_connect",
        action: "login_link_creation",
        actor_type: "user",
        error_name: authError.name,
        error_message: authError.message,
        outcome: "failure",
      });
      redirect("/dashboard?error=auth_failed");
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
    const stripeConnectService = createUserStripeConnectService();

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
      redirect("/dashboard/connect?message=account_required");
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

    logger.error("Failed to create Express Dashboard login link", {
      category: "stripe_connect",
      action: "login_link_creation",
      actor_type: "user",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      outcome: "failure",
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

    return { success: true };
  } catch (error) {
    // デバッグログ: エラーの詳細情報を出力
    logger.error("Failed to check Express Dashboard access", {
      category: "stripe_connect",
      action: "dashboard_access_check",
      actor_type: "user",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
      error_type: error instanceof Stripe.errors.StripeError ? error.type : "Unknown",
      error_code: error instanceof Stripe.errors.StripeError ? error.code : "Unknown",
      error_status_code: error instanceof Stripe.errors.StripeError ? error.statusCode : "Unknown",
      timestamp: new Date().toISOString(),
      outcome: "failure",
    });

    return {
      success: false,
      error: "アクセス状態の確認に失敗しました",
    };
  }
}
