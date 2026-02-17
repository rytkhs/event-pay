import "server-only";

import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";

import type { Payment, PaymentMethod, PaymentStatus } from "../types";

/**
 * イベントの決済リストを取得する（主催者用）
 */
export async function getPaymentsByEvent(
  eventId: string,
  userId: string,
  supabase: AppSupabaseClient<"public">
): Promise<Payment[]> {
  try {
    // まずイベントの存在と主催者権限を確認
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, created_by")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `イベント情報の取得に失敗しました: ${eventError.message}`,
        eventError
      );
    }

    if (!event) {
      throw new PaymentError(PaymentErrorType.EVENT_NOT_FOUND, "イベントが見つかりません");
    }

    if (event.created_by !== userId) {
      throw new PaymentError(PaymentErrorType.FORBIDDEN, "この操作を実行する権限がありません。");
    }

    // 決済情報を取得
    const { data, error } = await supabase
      .from("payments")
      .select(
        `
        *,
        attendances!inner (
          id,
          event_id
        )
      `
      )
      .eq("attendances.event_id", eventId);

    if (error) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `イベント決済情報の取得に失敗しました: ${error.message}`,
        error
      );
    }

    // ネストしたデータから決済情報のみを抽出
    return data.map((item) => ({
      id: item.id,
      attendance_id: item.attendance_id,
      method: item.method as PaymentMethod,
      amount: item.amount,
      status: item.status as PaymentStatus,
      stripe_payment_intent_id: item.stripe_payment_intent_id,
      webhook_event_id: item.webhook_event_id,
      webhook_processed_at: item.webhook_processed_at,
      paid_at: item.paid_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      "イベント決済情報の取得に失敗しました",
      error as Error
    );
  }
}
