import "server-only";

import type { PaymentLogger } from "@core/logging/payment-logger";
import { generateSecureUuid } from "@core/security/crypto";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { PaymentStatus } from "../types";

/**
 * 複数の決済ステータスを一括更新する（楽観的ロック対応）
 */
export async function bulkUpdatePaymentStatus(
  updates: Array<{
    paymentId: string;
    status: PaymentStatus;
    expectedVersion: number;
  }>,
  userId: string,
  supabase: AppSupabaseClient<"public">,
  logger: PaymentLogger,
  notes?: string
): Promise<{
  successCount: number;
  failureCount: number;
  failures: Array<{
    paymentId: string;
    error: string;
  }>;
}> {
  const contextLogger = logger.withContext({
    user_id: userId,
    correlation_id: `bulk_update_${generateSecureUuid()}`,
    bulk_operation_count: updates.length,
  });

  contextLogger.startOperation("bulk_update_payment_status", {
    update_count: updates.length,
    notes,
  });

  try {
    // 入力バリデーション
    if (updates.length === 0) {
      throw new PaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        "更新対象の決済が指定されていません"
      );
    }

    if (updates.length > 50) {
      throw new PaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        "一度に更新できる決済は最大50件です"
      );
    }

    // 一括更新用RPCに渡すJSONデータを構築
    const paymentUpdates = updates.map((update) => ({
      payment_id: update.paymentId,
      expected_version: update.expectedVersion,
      new_status: update.status,
    }));

    const { data, error } = await supabase.rpc("rpc_bulk_update_payment_status_safe", {
      p_payment_updates: paymentUpdates,
      p_user_id: userId,
      p_notes: notes ?? undefined,
    });

    if (error) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `一括更新に失敗しました: ${error.message}`,
        error
      );
    }

    // RPC結果をパース
    const result = data as {
      success_count: number;
      failure_count: number;
      failures: Array<{
        payment_id: string;
        error_code: string;
        error_message: string;
      }>;
    };

    const response = {
      successCount: result.success_count,
      failureCount: result.failure_count,
      failures: result.failures.map((failure) => ({
        paymentId: failure.payment_id,
        error: failure.error_message,
      })),
    };

    // 一括更新の結果をログに記録
    contextLogger.logBulkStatusUpdate(result.success_count, result.failure_count, {
      total_updates: updates.length,
      failures: result.failures.length > 0 ? result.failures : undefined,
    });

    contextLogger.operationSuccess("bulk_update_payment_status");

    return response;
  } catch (error) {
    // エラーログを記録
    contextLogger.logPaymentError("bulk_update_payment_status", error);

    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      "一括更新に失敗しました",
      error as Error
    );
  }
}
