"use server";

import { createClient } from "@core/supabase/server";
import { createServerActionError, type ServerActionResult } from "@core/types/server-actions";

import { StripeConnectErrorHandler } from "../services/error-handler";
import { StripeConnectService } from "../services/service";

/**
 * ユーザーのStripe Connectアカウント残高を取得する
 * @returns アカウント残高（JPY）
 */
export async function getStripeBalanceAction(): Promise<ServerActionResult<number>> {
  try {
    const supabase = createClient();

    // 認証確認
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    // Stripe Connectサービスを初期化
    const errorHandler = new StripeConnectErrorHandler();
    const stripeService = new StripeConnectService(supabase, errorHandler);

    // ユーザーのStripe Connectアカウントを取得
    const connectAccount = await stripeService.getConnectAccountByUser(user.id);

    if (!connectAccount) {
      // アカウントが設定されていない場合は0を返す
      return {
        success: true,
        data: 0,
      };
    }

    // 残高を取得
    const balance = await stripeService.getAccountBalance(connectAccount.stripe_account_id);

    return {
      success: true,
      data: balance,
    };
  } catch (error) {
    return createServerActionError("INTERNAL_ERROR", "Stripe残高の取得に失敗しました", {
      retryable: true,
      details: { originalError: error },
    });
  }
}
