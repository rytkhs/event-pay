import "server-only";

import type { PaymentLogger } from "@core/logging/payment-logger";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { PaymentStatus, ServiceUpdatePaymentStatusParams } from "../types";

/**
 * 楽観的ロック付きの決済ステータス更新（現金決済用）
 */
export async function updatePaymentStatusSafe(
  params: ServiceUpdatePaymentStatusParams,
  supabase: AppSupabaseClient<"public">
): Promise<void> {
  try {
    if (params.expectedVersion === undefined) {
      throw new PaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        "Expected version is required for safe status update"
      );
    }
    if (!params.userId) {
      throw new PaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        "User ID is required for status update"
      );
    }

    const { error } = await supabase.rpc("rpc_update_payment_status_safe", {
      p_payment_id: params.paymentId,
      p_new_status: params.status,
      p_expected_version: params.expectedVersion,
      p_user_id: params.userId,
      p_notes: params.notes,
    });

    if (error) {
      // PostgreSQLのエラーコードを確認
      if (error.code === "40001") {
        // serialization_failure = 楽観的ロック競合
        throw new PaymentError(
          PaymentErrorType.CONCURRENT_UPDATE,
          "他のユーザーによって同時に更新されました。最新の状態を確認してから再試行してください。"
        );
      } else if (error.code === "P0001") {
        // 権限エラー
        throw new PaymentError(PaymentErrorType.FORBIDDEN, "この操作を実行する権限がありません。");
      } else if (error.code === "P0002") {
        // 決済レコードが見つからない
        throw new PaymentError(
          PaymentErrorType.PAYMENT_NOT_FOUND,
          "指定された決済レコードが見つかりません。"
        );
      } else if (error.code === "P0003") {
        // 現金決済でない
        throw new PaymentError(
          PaymentErrorType.INVALID_PAYMENT_METHOD,
          "現金決済以外は手動更新できません。"
        );
      } else {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済ステータスの更新に失敗しました: ${error.message}`,
          error
        );
      }
    }

    // 正常に更新完了
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      "決済ステータスの更新に失敗しました",
      error as Error
    );
  }
}

/**
 * 従来の決済ステータス更新（Stripe決済用など）
 */
export async function updatePaymentStatusLegacy(
  params: ServiceUpdatePaymentStatusParams,
  supabase: AppSupabaseClient<"public">
): Promise<void> {
  const updateData: {
    status: PaymentStatus;
    paid_at?: string;
    stripe_payment_intent_id?: string | null;
  } = {
    status: params.status,
  };

  if (params.paidAt) {
    updateData.paid_at = params.paidAt.toISOString();
  }

  if (params.stripePaymentIntentId) {
    updateData.stripe_payment_intent_id = params.stripePaymentIntentId;
  }

  const { data, error } = await supabase
    .from("payments")
    .update(updateData)
    .eq("id", params.paymentId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      `決済ステータスの更新に失敗しました: ${error.message}`,
      error
    );
  }

  if (!data) {
    throw new PaymentError(
      PaymentErrorType.PAYMENT_NOT_FOUND,
      "指定された決済レコードが見つかりません"
    );
  }

  // 監査ログ記録
  const { logPayment } = await import("@core/logging/system-logger");
  await logPayment({
    action: "payment.status_update",
    message: `Payment status updated: ${params.paymentId}`,
    resource_id: params.paymentId,
    outcome: "success",
    metadata: {
      new_status: params.status,
      update_source: "service",
      paid_at: params.paidAt?.toISOString(),
    },
  });
}

/**
 * 決済ステータスを更新する
 */
export async function updatePaymentStatus(
  params: ServiceUpdatePaymentStatusParams,
  supabase: AppSupabaseClient<"public">,
  logger: PaymentLogger
): Promise<void> {
  const contextLogger = logger.withContext({
    payment_id: params.paymentId,
    new_status: params.status,
  });

  contextLogger.startOperation("update_payment_status");

  try {
    if (params.expectedVersion !== undefined) {
      await updatePaymentStatusSafe(params, supabase);
    } else {
      await updatePaymentStatusLegacy(params, supabase);
    }

    contextLogger.operationSuccess("update_payment_status", {
      safe_update: params.expectedVersion !== undefined,
    });
  } catch (error) {
    contextLogger.logPaymentError("update_payment_status", error);
    throw error;
  }
}
