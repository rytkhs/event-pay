"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyEventAccess, handleDatabaseError } from "@/lib/auth/event-authorization";

export async function getEventPaymentsAction(eventId: string) {
  try {
    // 共通の認証・権限確認処理
    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    const supabase = createClient();

    // 決済データ取得（attendancesテーブルを経由してイベントに紐づく決済を取得）
    const { data: payments, error } = await supabase
      .from("payments")
      .select(
        `
        id,
        method,
        amount,
        status,
        attendance_id,
        attendances!inner(event_id)
      `
      )
      .eq("attendances.event_id", validatedEventId);

    if (error) {
      handleDatabaseError(error, { eventId: validatedEventId, userId: user.id });
    }

    // attendancesの情報を除去してpayment情報のみ返す
    const cleanedPayments = (payments || []).map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
    }));

    return cleanedPayments;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error");
  }
}
