import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { Database } from "@/types/database";

import { CreateCashPaymentParams, CreateCashPaymentResult } from "../types";

/**
 * 現金決済レコードを作成する
 */
export async function createCashPayment(
  params: CreateCashPaymentParams,
  supabase: SupabaseClient<Database, "public">
): Promise<CreateCashPaymentResult> {
  try {
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        attendance_id: params.attendanceId,
        method: "cash",
        amount: params.amount,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      // 重複エラーの場合は専用のエラータイプを使用
      if (error.code === "23505") {
        throw new PaymentError(
          PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          "この参加記録に対する決済レコードは既に存在します",
          error
        );
      }

      // その他のDBエラー
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `現金決済の作成に失敗しました: ${error.message}`,
        error
      );
    }

    return {
      paymentId: payment.id,
    };
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }
    throw new PaymentError(
      PaymentErrorType.UNKNOWN_ERROR,
      "予期せぬエラーが発生しました",
      error as Error
    );
  }
}
