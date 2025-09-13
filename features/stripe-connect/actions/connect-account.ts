/**
 * Stripe Connect関連のServer Actions
 */
"use server";

import { redirect } from "next/navigation";

import { z } from "zod";

import { logger } from "@core/logging/app-logger";
import {
  CONNECT_REFRESH_PATH,
  CONNECT_RETURN_PATH,
  CONNECT_REFRESH_SUFFIX,
  CONNECT_RETURN_SUFFIX,
  isAllowedConnectPath,
} from "@core/routes/stripe-connect";
import { createClient } from "@core/supabase/server";
import { isNextRedirectError } from "@core/utils/next";

import { createUserStripeConnectService } from "../services";
import { StripeConnectError, StripeConnectErrorType } from "../types";

// 入力検証に起因するエラーかを判定
function isValidationError(err: unknown): boolean {
  try {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes("入力データが無効です") ||
      message.includes("不正なリダイレクトURLが指定されました") ||
      message.includes("不正なリダイレクトURLのパスが指定されました") ||
      message.includes("HTTPSのリダイレクトURLのみ許可されています")
    );
  } catch {
    return false;
  }
}

// バリデーションスキーマ
const CreateConnectAccountSchema = z.object({
  refreshUrl: z.string().url("有効なリフレッシュURLを指定してください"),
  returnUrl: z.string().url("有効なリターンURLを指定してください"),
});

// リダイレクトURLの検証関数（オリジン・パス検証を含む）。成功時は入力値をそのまま返す
function validateAndNormalizeRedirectUrls(formData: FormData): {
  refreshUrl: string;
  returnUrl: string;
} {
  const rawData = {
    refreshUrl: formData.get("refreshUrl") as string,
    returnUrl: formData.get("returnUrl") as string,
  };

  const validationResult = CreateConnectAccountSchema.safeParse(rawData);
  if (!validationResult.success) {
    const errorMessages = validationResult.error.errors.map((e) => e.message).join(", ");
    throw new Error(`入力データが無効です: ${errorMessages}`);
  }

  const { refreshUrl, returnUrl } = validationResult.data;

  const getAllowedOrigins = () => {
    const origins: string[] = [];
    if (process.env.NEXT_PUBLIC_APP_URL) {
      origins.push(process.env.NEXT_PUBLIC_APP_URL);
    }
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      origins.push(process.env.NEXT_PUBLIC_SITE_URL);
    }
    origins.push("http://localhost:3000");
    origins.push("https://localhost:3000");
    if (process.env.VERCEL_URL) {
      origins.push(`https://${process.env.VERCEL_URL}`);
    }
    if (process.env.ALLOWED_ORIGINS) {
      origins.push(
        ...process.env.ALLOWED_ORIGINS.split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      );
    }
    const normalize = (o: string) => o.replace(/\/$/, "");
    return Array.from(new Set(origins.filter(Boolean).map(normalize)));
  };

  const allowedOrigins = getAllowedOrigins();
  // const normalizeOrigin = (o: string) => o.replace(/\/$/, "");
  const refresh = new URL(refreshUrl);
  const ret = new URL(returnUrl);
  // スキーム差異(http/https)はここでは許容し、ホスト(含ポート)一致で判定
  const extractHost = (value: string) => {
    try {
      const u = new URL(value);
      return u.host; // hostname:port
    } catch {
      return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  };
  const isAllowedHost = (originLike: string) =>
    allowedOrigins.some((allowed) => extractHost(allowed) === extractHost(originLike));

  if (!isAllowedHost(refresh.origin) || !isAllowedHost(ret.origin)) {
    throw new Error("不正なリダイレクトURLが指定されました");
  }

  // 本番はHTTPSのみ許可（Stripe推奨）
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    if (refresh.protocol !== "https:" || ret.protocol !== "https:") {
      throw new Error("本番環境ではHTTPSのリダイレクトURLのみ許可されています");
    }
  }

  // パスはサフィックス一致で許容（将来サブパスに移動しても許容）。
  // 例: /app/v2/dashboard/connect/refresh など
  if (
    !isAllowedConnectPath(refresh.pathname, CONNECT_REFRESH_SUFFIX) ||
    !isAllowedConnectPath(ret.pathname, CONNECT_RETURN_SUFFIX)
  ) {
    throw new Error("不正なリダイレクトURLのパスが指定されました");
  }

  return { refreshUrl, returnUrl };
}

// レスポンス型定義
interface ConnectAccountStatusResult {
  success: boolean;
  error?: string;
  data?: {
    hasAccount: boolean;
    accountId?: string;
    status?: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirements?: {
      currently_due: string[];
      eventually_due: string[];
      past_due: string[];
      pending_verification: string[];
    };
    capabilities?: {
      card_payments?: "active" | "inactive" | "pending";
      transfers?: "active" | "inactive" | "pending";
    };
  };
}

/**
 * Stripe Connect Account Linkを生成するServer Action
 * 認証・認可チェックを強化し、適切なバリデーションとエラーハンドリングを実装
 */
export async function createConnectAccountAction(formData: FormData): Promise<void> {
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      logger.error("Stripe Connect account creation auth error", {
        tag: "connectAccountAuthError",
        error_name: authError.name,
        error_message: authError.message,
      });
      throw new Error("認証に失敗しました");
    }

    if (!user) {
      logger.warn("Unauthenticated user attempted Connect account creation", {
        tag: "connectAccountUnauthenticated",
      });
      throw new Error("認証が必要です");
    }

    if (!user.email) {
      logger.error("User has no email address for Connect account", {
        tag: "connectAccountNoEmail",
        user_id: user.id,
      });
      throw new Error("メールアドレスが設定されていません");
    }

    // 2. リダイレクトURLの検証（オリジン・パス含む）
    const { refreshUrl, returnUrl } = validateAndNormalizeRedirectUrls(formData);

    // 3. StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
    const stripeConnectService = createUserStripeConnectService();

    // 4. 既存のアカウントをチェック
    let existingAccount = await stripeConnectService.getConnectAccountByUser(user.id);

    // 5. アカウントが存在しない場合は新規作成
    if (!existingAccount) {
      await stripeConnectService.createExpressAccount({
        userId: user.id,
        email: user.email,
        country: "JP", // 日本固定
        businessType: "individual",
        businessProfile: {
          productDescription: "イベント参加費の管理・決済サービス",
        },
      });

      // 作成後に再取得
      existingAccount = await stripeConnectService.getConnectAccountByUser(user.id);
      if (!existingAccount) {
        logger.error("Failed to fetch account after creation", {
          tag: "connectAccountFetchAfterCreationFailed",
          user_id: user.id,
        });
        throw new Error("アカウント作成後の取得に失敗しました");
      }
    }

    // 6. Account Linkを生成（eventually_dueを指定してアップフロント登録）
    const accountLink = await stripeConnectService.createAccountLink({
      accountId: existingAccount.stripe_account_id,
      refreshUrl,
      returnUrl,
      type: "account_onboarding",
      collectionOptions: {
        fields: "eventually_due", // アップフロント登録でより多くの情報を一度に収集
      },
    });

    // 7. Account LinkのURLにリダイレクト
    redirect(accountLink.url);
  } catch (error) {
    // redirect 例外はそのまま再スロー（エラー扱いしない）
    if (isNextRedirectError(error)) {
      throw error as Error;
    }
    // フォールフォワード失敗時の実エラーを最終エラーとして扱う
    let finalError: unknown = error;
    let hadFallbackFailure = false;

    // 競合（同時実行）対策: 既存アカウントがすでに作成されていた場合はフォールフォワード
    if (
      error instanceof StripeConnectError &&
      error.type === StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS
    ) {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const stripeConnectService = createUserStripeConnectService();
          const existing = await stripeConnectService.getConnectAccountByUser(user.id);
          if (existing) {
            // 直ちにAccount Linkを生成してリダイレクト（検証を再適用）
            const { refreshUrl, returnUrl } = validateAndNormalizeRedirectUrls(formData);
            const accountLink = await stripeConnectService.createAccountLink({
              accountId: existing.stripe_account_id,
              refreshUrl,
              returnUrl,
              type: "account_onboarding",
              collectionOptions: { fields: "eventually_due" },
            });
            redirect(accountLink.url);
          }
        }
      } catch (fallbackError) {
        // ここでも redirect は再スロー
        if (isNextRedirectError(fallbackError)) {
          throw fallbackError as Error;
        }
        hadFallbackFailure = true;
        finalError = fallbackError;
        logger.warn("ACCOUNT_ALREADY_EXISTS fallback failed", {
          tag: "connectAccountFallbackFailed",
          error_name: fallbackError instanceof Error ? fallbackError.name : "Unknown",
          error_message:
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
    }

    // 構造化ログ（fallbackが失敗した場合は両方のコンテキストを出力）
    logger.error("Stripe Connect Account Link generation error", {
      tag: "connectAccountLinkGenerationError",
      error_name: finalError instanceof Error ? finalError.name : "Unknown",
      error_message: finalError instanceof Error ? finalError.message : String(finalError),
      original_error: hadFallbackFailure
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined,
      timestamp: new Date().toISOString(),
    });

    // 入力検証に起因するエラーはテスト容易性と一貫性のため再スロー（リダイレクトしない）
    if (isValidationError(finalError)) {
      throw finalError instanceof Error ? finalError : new Error(String(finalError));
    }

    if (finalError instanceof StripeConnectError) {
      const errorMessage = encodeURIComponent(finalError.message);
      redirect(`/dashboard/connect/error?message=${errorMessage}&type=${finalError.type}`);
    }

    const errorMessage = encodeURIComponent(
      finalError instanceof Error ? finalError.message : "アカウント設定中にエラーが発生しました"
    );
    redirect(`/dashboard/connect/error?message=${errorMessage}`);
  }
}

/**
 * Stripe Connect アカウントステータスを取得するServer Action
 * 認証・認可チェックを強化し、詳細なログ出力とエラーハンドリングを実装
 */
export async function getConnectAccountStatusAction(): Promise<ConnectAccountStatusResult> {
  try {
    // 1. 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      logger.error("Auth error in Connect account status check", {
        tag: "connectAccountStatusAuthError",
        error_name: authError.name,
        error_message: authError.message,
      });
      return {
        success: false,
        error: "認証に失敗しました",
      };
    }

    if (!user) {
      logger.warn("Unauthenticated user attempted Connect account status check", {
        tag: "connectAccountStatusUnauthenticated",
      });
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 2. StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
    const stripeConnectService = createUserStripeConnectService();

    // 3. アカウント情報を取得
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (!account) {
      return {
        success: true,
        data: {
          hasAccount: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      };
    }

    // 4. Stripeから最新の情報を取得

    const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

    // 5. データベースの情報が古い場合は更新
    const needsUpdate =
      account.status !== accountInfo.status ||
      account.charges_enabled !== accountInfo.chargesEnabled ||
      account.payouts_enabled !== accountInfo.payoutsEnabled;

    if (needsUpdate) {
      await stripeConnectService.updateAccountStatus({
        userId: user.id,
        status: accountInfo.status,
        chargesEnabled: accountInfo.chargesEnabled,
        payoutsEnabled: accountInfo.payoutsEnabled,
      });
    }

    return {
      success: true,
      data: {
        hasAccount: true,
        accountId: account.stripe_account_id,
        status: accountInfo.status,
        chargesEnabled: accountInfo.chargesEnabled,
        payoutsEnabled: accountInfo.payoutsEnabled,
        requirements: accountInfo.requirements,
        capabilities: accountInfo.capabilities,
      },
    };
  } catch (error) {
    logger.error("Stripe Connect account status fetch error", {
      tag: "connectAccountStatusFetchError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error:
        error instanceof StripeConnectError
          ? error.message
          : "アカウント情報の取得中にエラーが発生しました",
    };
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
    logger.error("Auth error in onboarding complete", {
      tag: "connectOnboardingCompleteAuthError",
      error_name: authError.name,
      error_message: authError.message,
    });
    throw new Error("認証に失敗しました");
  }

  if (!user) {
    logger.warn("Unauthenticated user attempted onboarding complete", {
      tag: "connectOnboardingCompleteUnauthenticated",
    });
    throw new Error("認証が必要です");
  }

  return user;
}

/**
 * オンボーディング完了後の処理を行うServer Action
 * 認証・認可チェックを強化し、詳細なログ出力を実装
 */
export async function handleOnboardingReturnAction(): Promise<void> {
  try {
    // 1. 認証チェック
    const user = await getAuthenticatedUser();

    // 2. StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
    const stripeConnectService = createUserStripeConnectService();

    // 3. アカウント情報を取得して最新状態に同期（軽量リトライ付き）
    const account = await stripeConnectService.getConnectAccountByUser(user.id);

    if (account) {
      const retry = async <T>(
        fn: () => Promise<T>,
        attempts = 3,
        baseDelayMs = 200
      ): Promise<T> => {
        let lastErr: unknown;
        for (let i = 0; i < attempts; i++) {
          try {
            return await fn();
          } catch (e) {
            lastErr = e;
            // Stripe 側の整合に多少の遅延がある場合に備え、指数バックオフで再試行
            const delay = baseDelayMs * Math.pow(2, i);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      };

      const accountInfo = await retry(() =>
        stripeConnectService.getAccountInfo(account.stripe_account_id)
      );

      await retry(() =>
        stripeConnectService.updateAccountStatus({
          userId: user.id,
          status: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
        })
      );
    } else {
      logger.warn("Account not found during onboarding complete", {
        tag: "connectOnboardingCompleteAccountNotFound",
        user_id: user.id,
      });
    }

    // ダッシュボードにリダイレクト（成功メッセージ付き）
    redirect("/dashboard?connect=success");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error as Error;
    }
    logger.error("Onboarding complete processing error", {
      tag: "connectOnboardingCompleteProcessingError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message === "認証が必要です") {
      redirect("/login");
    }

    // エラーページにリダイレクト
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : "アカウント設定の完了処理中にエラーが発生しました"
    );
    redirect(`/dashboard/connect/error?message=${errorMessage}`);
  }
}

/**
 * オンボーディングリフレッシュ処理を行うServer Action
 * 認証・認可チェックを強化し、詳細なログ出力を実装
 */
export async function handleOnboardingRefreshAction(): Promise<void> {
  try {
    // 1. 認証チェック
    const user = await getAuthenticatedUser();

    // 2. 必要情報の準備（ベースURL → refresh/return URL）
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
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
        businessProfile: { productDescription: "イベント参加費の管理・決済サービス" },
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
    logger.error("Onboarding refresh processing error", {
      tag: "connectOnboardingRefreshProcessingError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
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
    redirect(`/dashboard/connect/error?message=${errorMessage}`);
  }
}

/**
 * Stripe Connectアカウントの権限チェックを行うServer Action
 * 特定の操作（決済受取、送金）が可能かどうかを確認
 */
export async function checkConnectPermissionsAction(): Promise<{
  success: boolean;
  error?: string;
  data?: {
    canReceivePayments: boolean;
    canReceivePayouts: boolean;
    isVerified: boolean;
    restrictions?: string[];
  };
}> {
  try {
    // 1. 認証チェック
    const user = await getAuthenticatedUser();

    // 2. StripeConnectServiceを初期化（ユーザーセッション使用、RLS適用）
    const stripeConnectService = createUserStripeConnectService();

    // 3. 各権限をチェック（MVP: destination charges 前提のため、
    //    canReceivePayments は接続アカウントのcharges_enabledに依存させない）
    const [canReceivePayouts, isVerified] = await Promise.all([
      stripeConnectService.isPayoutsEnabled(user.id),
      stripeConnectService.isAccountVerified(user.id),
    ]);

    // 4. アカウント情報を取得して制限事項を確認
    const account = await stripeConnectService.getConnectAccountByUser(user.id);
    const restrictions: string[] = [];

    if (account) {
      const accountInfo = await stripeConnectService.getAccountInfo(account.stripe_account_id);

      // 制限事項を抽出
      if (
        accountInfo.requirements?.currently_due &&
        accountInfo.requirements.currently_due.length > 0
      ) {
        restrictions.push(`必要な情報: ${accountInfo.requirements.currently_due.join(", ")}`);
      }

      if (accountInfo.requirements?.past_due && accountInfo.requirements.past_due.length > 0) {
        restrictions.push(`期限切れ情報: ${accountInfo.requirements.past_due.join(", ")}`);
      }
    }

    const canReceivePayments = isVerified && canReceivePayouts;

    return {
      success: true,
      data: {
        canReceivePayments,
        canReceivePayouts,
        isVerified,
        restrictions: restrictions.length > 0 ? restrictions : undefined,
      },
    };
  } catch (error) {
    logger.error("Stripe Connect permission check error", {
      tag: "connectPermissionCheckError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error:
        error instanceof StripeConnectError
          ? error.message
          : "権限チェック中にエラーが発生しました",
    };
  }
}
