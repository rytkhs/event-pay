import { unstable_cache } from "next/cache";

import { logger } from "@core/logging/app-logger";
import { getStripe } from "@core/stripe/client";
import { createClient } from "@core/supabase/server";
import { createServerActionError, type ServerActionResult } from "@core/types/server-actions";

import { StripeConnectErrorHandler } from "../services/error-handler";
import { StripeConnectService } from "../services/service";

/**
 * Stripe残高取得のキャッシュ関数を生成
 * Revalidate: 5分 (300秒)
 * accountIdをkeyPartsに含めてアカウントごとにキャッシュを分離
 */
const getCachedBalance = (accountId: string) =>
  unstable_cache(
    async () => {
      logger.info("Stripe Connect残高取得を開始 (Cached)", {
        category: "stripe_connect",
        action: "balance_retrieval",
        actor_type: "system",
        account_id: accountId,
        outcome: "success",
      });

      const stripe = getStripe();
      const balance = await stripe.balance.retrieve({
        stripeAccount: accountId,
      });

      // JPYの利用可能残高を取得（available + pending）
      const availableJpy = balance.available.find((b) => b.currency === "jpy");
      const pendingJpy = balance.pending.find((b) => b.currency === "jpy");

      const availableAmount = availableJpy ? availableJpy.amount : 0;
      const pendingAmount = pendingJpy ? pendingJpy.amount : 0;
      const totalAmount = availableAmount + pendingAmount;

      logger.info("Stripe Connect残高取得完了 (Cached)", {
        category: "stripe_connect",
        action: "balance_retrieval",
        actor_type: "system",
        account_id: accountId,
        total_amount: totalAmount,
        outcome: "success",
      });

      return totalAmount;
    },
    ["stripe-connect-balance", accountId],
    {
      revalidate: 300,
      tags: ["stripe-balance", `stripe-balance-${accountId}`],
    }
  )();

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
    // 残高を取得 (キャッシュを使用)
    const balance = await getCachedBalance(connectAccount.stripe_account_id);

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
