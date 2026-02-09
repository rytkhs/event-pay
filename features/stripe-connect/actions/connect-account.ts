/**
 * Stripe Connect関連のServer Actions
 */

import { redirect } from "next/navigation";

import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { createClient } from "@core/supabase/server";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";
import { isNextRedirectError } from "@core/utils/next";

import { CONNECT_REFRESH_PATH, CONNECT_RETURN_PATH } from "../constants/routes";
import { createUserStripeConnectService } from "../services/factories";
import { type ConnectAccountStatusPayload, StripeConnectError } from "../types";

/**
 * Stripe Connect アカウントステータスを取得するServer Action
 * 認証・認可チェックを強化し、詳細なログ出力とエラーハンドリングを実装
 *
 * UIStatusMapperを使用してUI Statusを計算
 * StatusSyncServiceを使用してステータス同期を実行
 */
export async function getConnectAccountStatusAction(): Promise<
  ActionResult<ConnectAccountStatusPayload>
> {
  const actionLogger = logger.withContext({
    category: "stripe_connect",
    action: "get_connect_account_status",
    actor_type: "user",
  });

  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    userId = user?.id;

    if (authError) {
      handleServerError(authError, {
        category: "stripe_connect",
        action: "get_connect_account_status_auth_failed",
      });
      return fail("UNAUTHORIZED", { userMessage: "認証に失敗しました" });
    }

    if (!user) {
      actionLogger.warn("Unauthenticated user attempted Connect account status check", {
        outcome: "failure",
      });
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 2. StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
    const stripeConnectService = createUserStripeConnectService();

    // 3. アカウント情報を取得
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      // 要件 2.2: アカウント未作成の場合は no_account を返す
      const { UIStatusMapper } = await import("../services/ui-status-mapper");
      const mapper = new UIStatusMapper();
      const uiStatus = mapper.mapToUIStatus(null);

      return ok({
        hasAccount: false,
        uiStatus,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    }

    // 4. StatusSyncServiceを使用してステータス同期を実行
    const { StatusSyncService } = await import("../services/status-sync-service");
    const statusSyncService = new StatusSyncService(stripeConnectService);

    let stripeAccount;
    try {
      // 同期処理でStripe Accountオブジェクトを取得（API呼び出しを1回に削減）
      stripeAccount = await statusSyncService.syncAccountStatus(
        user.id,
        account.stripe_account_id,
        {
          maxRetries: 3,
        }
      );
    } catch (syncError) {
      // 同期エラーはログに記録するが、キャッシュされたステータスを使用して続行
      actionLogger.warn("Status sync failed, using cached status", {
        user_id: user.id,
        account_id: account.stripe_account_id,
        error_message: syncError instanceof Error ? syncError.message : String(syncError),
        outcome: "failure",
      });

      // フォールバック: Stripeから直接取得
      const { getStripe } = await import("@core/stripe/client");
      const stripe = getStripe();
      stripeAccount = await stripe.accounts.retrieve(account.stripe_account_id);
    }

    // 5. 最新のアカウント情報を取得（同期後）
    const updatedAccount = await stripeConnectService.getConnectAccountByUser(user.id);
    if (!updatedAccount) {
      throw new Error("アカウント情報の取得に失敗しました");
    }

    // 7. UIStatusMapperを使用してUI Statusを計算（要件 2.1-2.6）
    const { UIStatusMapper } = await import("../services/ui-status-mapper");
    const mapper = new UIStatusMapper();
    const uiStatus = mapper.mapToUIStatus(updatedAccount.status, stripeAccount);

    // 8. requirements と capabilities の整形
    const requirements = stripeAccount.requirements
      ? {
          currently_due: stripeAccount.requirements.currently_due || [],
          eventually_due: stripeAccount.requirements.eventually_due || [],
          past_due: stripeAccount.requirements.past_due || [],
          pending_verification: stripeAccount.requirements.pending_verification || [],
        }
      : {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        };

    const capabilities = stripeAccount.capabilities
      ? {
          card_payments:
            typeof stripeAccount.capabilities.card_payments === "string"
              ? (stripeAccount.capabilities.card_payments as "active" | "inactive" | "pending")
              : (stripeAccount.capabilities.card_payments as any)?.status,
          transfers:
            typeof stripeAccount.capabilities.transfers === "string"
              ? (stripeAccount.capabilities.transfers as "active" | "inactive" | "pending")
              : (stripeAccount.capabilities.transfers as any)?.status,
        }
      : undefined;

    return ok({
      hasAccount: true,
      accountId: updatedAccount.stripe_account_id,
      dbStatus: updatedAccount.status,
      uiStatus,
      chargesEnabled: updatedAccount.charges_enabled,
      payoutsEnabled: updatedAccount.payouts_enabled,
      requirements,
      capabilities,
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    handleServerError(error, {
      category: "stripe_connect",
      action: "get_connect_account_status_failed",
      userId,
    });

    return fail("INTERNAL_ERROR", {
      userMessage:
        error instanceof StripeConnectError
          ? error.message
          : "アカウント情報の取得中にエラーが発生しました",
    });
  }
}

/**
 * 認証済みユーザーを取得するヘルパー関数
 */
async function getAuthenticatedUser() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    handleServerError(authError, {
      category: "stripe_connect",
      action: "onboarding_complete_auth_failed",
    });
    throw new Error("認証に失敗しました");
  }

  if (!user) {
    logger.warn("Unauthenticated user attempted onboarding complete", {
      category: "stripe_connect",
      action: "onboarding_complete_auth",
      actor_type: "user",
      outcome: "failure",
    });
    throw new Error("認証が必要です");
  }

  return user;
}

/**
 * オンボーディング完了後の処理を行うServer Action
 * 認証・認可チェックを強化し、詳細なログ出力を実装
 *
 * StatusSyncServiceを使用してリトライ付き同期を実装
 * エラーハンドリングを強化
 * キャッシュされたステータスを使用してフォールバック
 */
export async function handleOnboardingReturnAction(): Promise<
  ActionResult<{ redirectUrl: string }>
> {
  const actionLogger = logger.withContext({
    category: "stripe_connect",
    action: "handle_onboarding_return",
    actor_type: "user",
  });

  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const user = await getAuthenticatedUser();
    userId = user.id;

    // 2. StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
    const stripeConnectService = createUserStripeConnectService();

    // 3. アカウント情報を取得
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (account) {
      // 4. StatusSyncServiceを使用してリトライ付き同期を実装
      const { StatusSyncService } = await import("../services/status-sync-service");
      const statusSyncService = new StatusSyncService(stripeConnectService);

      let accountInfo;
      try {
        // リトライ付きでステータス同期を実行（Stripe Accountオブジェクトを取得）
        await statusSyncService.syncAccountStatus(user.id, account.stripe_account_id, {
          maxRetries: 3,
          initialBackoffMs: 200,
        });

        // 同期後の最新情報を取得（DBから）
        const updatedAccount = await stripeConnectService.getConnectAccountByUser(user.id);
        if (!updatedAccount) {
          throw new Error("アカウント情報の取得に失敗しました");
        }

        accountInfo = {
          accountId: updatedAccount.stripe_account_id,
          status: updatedAccount.status,
          chargesEnabled: updatedAccount.charges_enabled,
          payoutsEnabled: updatedAccount.payouts_enabled,
        };
      } catch (syncError) {
        // 要件 9.4: 同期エラー時はキャッシュされたステータスを使用
        actionLogger.warn("Status sync failed during onboarding return, using cached status", {
          user_id: user.id,
          account_id: account.stripe_account_id,
          error_message: syncError instanceof Error ? syncError.message : String(syncError),
          outcome: "failure",
        });

        // キャッシュされたステータスを使用（DBから取得）
        const cachedAccount = await stripeConnectService.getConnectAccountByUser(user.id);
        if (cachedAccount) {
          accountInfo = {
            accountId: cachedAccount.stripe_account_id,
            status: cachedAccount.status,
            chargesEnabled: cachedAccount.charges_enabled,
            payoutsEnabled: cachedAccount.payouts_enabled,
          };
        } else {
          throw new Error("アカウント情報の取得に失敗しました");
        }
      }

      // 5. Slack通知（Connectオンボーディング完了）
      try {
        const timestamp = new Date().toISOString();
        const slackText = `[Stripe Connect Onboarding Completed]
ユーザーID: ${user.id}
Stripe Account ID: ${account.stripe_account_id}
ステータス: ${accountInfo.status}
Charges Enabled: ${accountInfo.chargesEnabled ? "Yes" : "No"}
Payouts Enabled: ${accountInfo.payoutsEnabled ? "Yes" : "No"}
完了時刻: ${timestamp}`;

        const slackResult = await sendSlackText(slackText);

        if (!slackResult.success) {
          actionLogger.warn("Connect onboarding Slack notification failed", {
            user_id: user.id,
            slack_error_message: slackResult.error.message,
            slack_error_code: slackResult.error.code,
            retryable: slackResult.error.retryable,
            slack_error_details: slackResult.error.details,
            outcome: "failure",
          });
        }
      } catch (error) {
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "onboarding_complete_slack_notification_failed",
          userId: user.id,
          additionalData: {
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    } else {
      actionLogger.warn("Account not found during onboarding complete", {
        user_id: user.id,
        outcome: "failure",
      });
    }

    // 設定ページにリダイレクト用のURLを返す
    return ok({ redirectUrl: "/settings/payments?connect=success" });
  } catch (error) {
    handleServerError(error, {
      category: "stripe_connect",
      action: "onboarding_complete_failed",
      userId,
    });

    if (error instanceof Error && error.message === "認証が必要です") {
      return fail("UNAUTHORIZED", {
        userMessage: "認証が必要です",
        redirectUrl: "/login",
      });
    }

    // エラーページ用URL生成
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : "アカウント設定の完了処理中にエラーが発生しました"
    );
    return fail("STRIPE_CONNECT_SERVICE_ERROR", {
      userMessage:
        error instanceof Error ? error.message : "アカウント設定の完了処理中にエラーが発生しました",
      redirectUrl: `/settings/payments/error?message=${errorMessage}`,
    });
  }
}

/**
 * オンボーディングリフレッシュ処理を行うServer Action
 * 認証・認可チェックを強化し、詳細なログ出力を実装
 */
export async function handleOnboardingRefreshAction(): Promise<void> {
  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const user = await getAuthenticatedUser();
    userId = user.id;

    // 2. 必要情報の準備（ベースURL → refresh/return URL）
    const baseUrl = getEnv().NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const refreshUrl = `${baseUrl}${CONNECT_REFRESH_PATH}`;
    const returnUrl = `${baseUrl}${CONNECT_RETURN_PATH}`;

    // 3. StripeConnectServiceを初期化
    const stripeConnectService = createUserStripeConnectService();

    // 4. 既存アカウントを取得（無ければ作成）
    let account = await stripeConnectService.getConnectAccountByUser(user.id);
    if (!account) {
      await stripeConnectService.createExpressAccount({
        userId: user.id,
        email: user.email || `${user.id}@example.com`,
        country: "JP",
        businessType: "individual",
        businessProfile: {
          productDescription:
            "イベントを運営しています。イベントの参加者が参加費を支払う際、イベント管理プラットフォームのみんなの集金を使って参加費が決済されます。",
        },
      });
      account = await stripeConnectService.getConnectAccountByUser(user.id);
      if (!account) {
        throw new Error("アカウント情報の取得に失敗しました");
      }
    }

    // 5. Account Linkを生成して即リダイレクト
    const accountLink = await stripeConnectService.createAccountLink({
      accountId: account.stripe_account_id,
      refreshUrl,
      returnUrl,
      type: "account_onboarding",
      collectionOptions: { fields: "eventually_due" },
    });
    redirect(accountLink.url);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error as Error;
    }
    handleServerError(error, {
      category: "stripe_connect",
      action: "onboarding_refresh_failed",
      userId,
    });

    if (error instanceof Error && error.message === "認証が必要です") {
      redirect("/login");
    }

    // エラーページにリダイレクト
    const errorMessage = encodeURIComponent(
      error instanceof Error
        ? error.message
        : "アカウント設定のリフレッシュ中にエラーが発生しました"
    );
    redirect(`/settings/payments/error?message=${errorMessage}`);
  }
}

/**
 * シンプルなオンボーディング開始処理
 * Connectアカウント作成とAccount Link生成のみを行う
 */
export async function startOnboardingAction(): Promise<void> {
  const actionLogger = logger.withContext({
    category: "stripe_connect",
    action: "start_onboarding",
    actor_type: "user",
  });

  let userId: string | undefined;
  try {
    // 1. 認証チェック
    const user = await getAuthenticatedUser();
    userId = user.id;

    // 2. 必要情報の準備（ベースURL → refresh/return URL）
    const baseUrl = getEnv().NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const refreshUrl = `${baseUrl}${CONNECT_REFRESH_PATH}`;
    const returnUrl = `${baseUrl}${CONNECT_RETURN_PATH}`;

    // 3. StripeConnectServiceを初期化
    const stripeConnectService = createUserStripeConnectService();

    // 4. 既存アカウントを取得（無ければ作成）
    let account = await stripeConnectService.getConnectAccountByUser(user.id);
    if (!account) {
      await stripeConnectService.createExpressAccount({
        userId: user.id,
        email: user.email || `${user.id}@example.com`,
        country: "JP",
        businessType: "individual",
        businessProfile: {
          productDescription:
            "イベントを運営しています。イベントの参加者が参加費を支払う際、イベント管理プラットフォームのみんなの集金を使って参加費が決済されます。",
        },
      });
      account = await stripeConnectService.getConnectAccountByUser(user.id);
      if (!account) {
        throw new Error("アカウント情報の取得に失敗しました");
      }
    }

    // 5. Account Linkを生成して即リダイレクト
    const accountLink = await stripeConnectService.createAccountLink({
      accountId: account.stripe_account_id,
      refreshUrl,
      returnUrl,
      type: "account_onboarding",
      collectionOptions: { fields: "eventually_due" },
    });

    // 6. ログ記録
    actionLogger.info("Simple onboarding started", {
      user_id: user.id,
      account_id: account.stripe_account_id,
      outcome: "success",
    });

    redirect(accountLink.url);
  } catch (error) {
    // redirect 例外はそのまま再スロー（エラー扱いしない）
    if (isNextRedirectError(error)) {
      throw error as Error;
    }

    // 構造化ログ
    handleServerError(error, {
      category: "stripe_connect",
      action: "start_onboarding_failed",
      userId,
    });

    // StripeConnectErrorによるエラーページリダイレクト
    if (error instanceof StripeConnectError) {
      const errorMessage = encodeURIComponent(error.message);
      redirect(`/settings/payments/error?message=${errorMessage}&type=${error.type}`);
    }

    // その他のエラー
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : "オンボーディング開始中にエラーが発生しました"
    );
    redirect(`/settings/payments/error?message=${errorMessage}`);
  }
}
