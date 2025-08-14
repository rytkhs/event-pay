/**
 * 送金データ整合性修復用のServer Actions
 * 管理者が手動で不整合を修復するためのアクション
 */

"use server";

import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { PayoutReconciliationService } from "@/lib/services/payout/reconciliation";
import { PayoutService } from "@/lib/services/payout/service";
import { PayoutErrorHandler } from "@/lib/services/payout/error-handler";
import { StripeConnectService } from "@/lib/services/stripe-connect/service";
import { PayoutValidator } from "@/lib/services/payout/validator";
import { getCurrentUser } from "@/lib/auth/server";
import { stripe } from "@/lib/stripe/client";

export interface ReconcilePayoutActionParams {
  payoutId: string;
}

export interface ReconcilePayoutActionResult {
  success: boolean;
  error?: string;
  payout?: {
    id: string;
    status: string;
    transferId?: string;
    lastError?: string;
  };
}

/**
 * 個別送金の手動修復
 */
export async function reconcilePayoutAction(
  params: ReconcilePayoutActionParams
): Promise<ReconcilePayoutActionResult> {
  try {
    // 認証チェック
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // 管理者権限チェック（実装に応じて調整）
    // TODO: 実際のロール管理システムに合わせて実装
    const isAdmin = user.email?.endsWith("@admin.example.com") || false;
    if (!isAdmin) {
      return { success: false, error: "管理者権限が必要です" };
    }

    // Service Role クライアントを作成
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 送金レコードを取得
    const { data: payout, error: fetchError } = await supabase
      .from("payouts")
      .select("*")
      .eq("id", params.payoutId)
      .single();

    if (fetchError || !payout) {
      return { success: false, error: "送金レコードが見つかりません" };
    }

    // processing_error状態以外は修復対象外
    if (payout.status !== "processing_error") {
      return {
        success: false,
        error: `修復対象外のステータスです: ${payout.status}`
      };
    }

    if (!payout.stripe_transfer_id) {
      return {
        success: false,
        error: "Stripe Transfer IDが見つかりません"
      };
    }

    // Stripe APIからTransfer情報を取得
    const transfer = await stripe.transfers.retrieve(payout.stripe_transfer_id);

    // Reconciliation サービスで修復
    const reconciliationService = new PayoutReconciliationService(supabase);

    // 個別修復処理を実行
    const fixed = await (reconciliationService as any).reconcileTransfer(transfer, false);

    if (!fixed) {
      return {
        success: false,
        error: "修復が不要または失敗しました"
      };
    }

    // 修復後の状態を取得
    const { data: updatedPayout } = await supabase
      .from("payouts")
      .select("*")
      .eq("id", params.payoutId)
      .single();

    return {
      success: true,
      payout: {
        id: params.payoutId,
        status: updatedPayout?.status || "unknown",
        transferId: updatedPayout?.stripe_transfer_id || undefined,
        lastError: updatedPayout?.last_error || undefined,
      },
    };

  } catch (error) {
    console.error("Reconcile payout action failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "修復に失敗しました",
    };
  }
}

export interface GetProcessingErrorPayoutsResult {
  success: boolean;
  error?: string;
  payouts?: Array<{
    id: string;
    eventId: string;
    userId: string;
    status: string;
    netAmount: number;
    transferId?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * processing_error状態の送金一覧を取得
 */
export async function getProcessingErrorPayoutsAction(): Promise<GetProcessingErrorPayoutsResult> {
  try {
    // 認証チェック
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // 管理者権限チェック
    const isAdmin = user.email?.endsWith("@admin.example.com") || false;
    if (!isAdmin) {
      return { success: false, error: "管理者権限が必要です" };
    }

    // Service Role クライアントを作成
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // processing_error状態の送金を取得
    const { data: payouts, error } = await supabase
      .from("payouts")
      .select("*")
      .eq("status", "processing_error")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: "データ取得に失敗しました" };
    }

    return {
      success: true,
      payouts: (payouts || []).map(payout => ({
        id: payout.id,
        eventId: payout.event_id,
        userId: payout.user_id,
        status: payout.status,
        netAmount: payout.net_payout_amount,
        transferId: payout.stripe_transfer_id || undefined,
        lastError: payout.last_error || undefined,
        createdAt: payout.created_at,
        updatedAt: payout.updated_at,
      })),
    };

  } catch (error) {
    console.error("Get processing error payouts failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "データ取得に失敗しました",
    };
  }
}

export interface RetryPayoutActionParams {
  payoutId: string;
}

export interface RetryPayoutActionResult {
  success: boolean;
  error?: string;
  payout?: {
    id: string;
    status: string;
    transferId?: string;
  };
}

/**
 * 送金の再実行
 * processing_error状態の送金を再実行する
 */
export async function retryPayoutAction(
  params: RetryPayoutActionParams
): Promise<RetryPayoutActionResult> {
  try {
    // 認証チェック
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "認証が必要です" };
    }

    // 管理者権限チェック
    const isAdmin = user.email?.endsWith("@admin.example.com") || false;
    if (!isAdmin) {
      return { success: false, error: "管理者権限が必要です" };
    }

    // Service Role クライアントを作成
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // PayoutServiceを初期化
    const errorHandler = new PayoutErrorHandler();
    const stripeConnectService = new StripeConnectService(supabase);
    const validator = new PayoutValidator(supabase, stripeConnectService);

    const payoutService = new PayoutService(
      supabase,
      errorHandler,
      stripeConnectService,
      validator
    );

    // 送金再実行
    const result = await payoutService.retryPayout(params.payoutId);

    return {
      success: true,
      payout: {
        id: result.payoutId,
        status: "processing",
        transferId: result.transferId || undefined,
      },
    };

  } catch (error) {
    console.error("Retry payout action failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "再実行に失敗しました",
    };
  }
}
