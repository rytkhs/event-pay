import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { Database } from "@/types/database";

import { OPEN_PAYMENT_STATUSES, TERMINAL_PAYMENT_STATUSES } from "../stripe-session/types";
import type { Payment } from "../types";
import { findLatestPaymentByEffectiveTime } from "../utils/payment-effective-time";

/**
 * 参加記録IDから決済情報を取得する
 *
 * 注: canceledの決済は返さない（履歴として残るのみで、再参加時は新しい決済を作成するため）
 */
export async function getPaymentByAttendance(
  attendanceId: string,
  supabase: SupabaseClient<Database, "public">
): Promise<Payment | null> {
  try {
    // open（pending/failed）を優先的に返す（統一されたソート使用）
    const { data: openPayments, error: openError } = await supabase
      .from("payments")
      .select("*")
      .eq("attendance_id", attendanceId)
      .in("status", OPEN_PAYMENT_STATUSES);

    if (openError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済情報の取得に失敗しました: ${openError.message}`,
        openError
      );
    }

    const latestOpenPayment = findLatestPaymentByEffectiveTime(
      openPayments || [],
      TERMINAL_PAYMENT_STATUSES
    );
    if (latestOpenPayment) return latestOpenPayment as Payment;

    // openが無い場合は、最新の決済完了系（paid/received/refunded/waived）を返す（統一されたソート使用）
    const { data: terminalPayments, error: terminalError } = await supabase
      .from("payments")
      .select("*")
      .eq("attendance_id", attendanceId)
      .in("status", TERMINAL_PAYMENT_STATUSES);

    if (terminalError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済情報の取得に失敗しました: ${terminalError.message}`,
        terminalError
      );
    }

    const latestTerminalPayment = findLatestPaymentByEffectiveTime(
      terminalPayments || [],
      TERMINAL_PAYMENT_STATUSES
    );
    if (!latestTerminalPayment) return null;
    return latestTerminalPayment as Payment;
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      "決済情報の取得に失敗しました",
      error as Error
    );
  }
}

/**
 * 決済IDから決済情報を取得する
 */
export async function getPaymentById(
  paymentId: string,
  supabase: SupabaseClient<Database, "public">
): Promise<Payment | null> {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済情報の取得に失敗しました: ${error.message}`,
        error
      );
    }

    if (!data) return null;
    return data as Payment;
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentError(
      PaymentErrorType.DATABASE_ERROR,
      "決済情報の取得に失敗しました",
      error as Error
    );
  }
}
