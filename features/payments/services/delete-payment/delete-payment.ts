import "server-only";

import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";

/**
 * 決済レコードを削除する
 */
export async function deletePayment(
  paymentId: string,
  supabase: AppSupabaseClient<"public">
): Promise<void> {
  try {
    const { error } = await supabase.from("payments").delete().eq("id", paymentId);

    if (error) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済レコードの削除に失敗しました: ${error.message}`,
        error
      );
    }

    // 監査ログ記録
    const { logPayment } = await import("@core/logging/system-logger");
    await logPayment({
      action: "payment.delete",
      message: `Payment deleted: ${paymentId}`,
      resource_id: paymentId,
      outcome: "success",
      metadata: { reason: "manual_deletion" },
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      "決済レコードの削除に失敗しました",
      error as Error
    );
  }
}
