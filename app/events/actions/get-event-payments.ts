"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyEventAccess, handleDatabaseError } from "@/lib/auth/event-authorization";
import {
  GetEventPaymentsResponseSchema,
  type GetEventPaymentsResponse,
  type PaymentMethodSummary,
  type PaymentStatusSummary,
  type PaymentSummary,
  PAYMENT_STATUS_VALUES,
  PaymentStatusEnum,
} from "@/lib/validation/participant-management";
import type { z } from "zod";
import { logger } from "@/lib/logging/app-logger";

type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/**
 * イベント決済情報取得（集計付き）
 * MANAGE-002: 決済状況確認/集計
 */
export async function getEventPaymentsAction(eventId: string): Promise<GetEventPaymentsResponse> {
  // 認可チェック
  const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

  const supabase = createClient();

  // 決済データ取得
  const { data: payments, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      method,
      amount,
      status,
      attendance_id,
      paid_at,
      created_at,
      updated_at,
      attendances!inner(event_id)
    `
    )
    .eq("attendances.event_id", validatedEventId);

  if (error) {
    handleDatabaseError(error, { eventId: validatedEventId, userId: user.id });
  }

  const cleanedPayments = (payments || []).map((payment) => ({
    id: payment.id,
    method: payment.method,
    amount: payment.amount,
    status: payment.status,
    attendance_id: payment.attendance_id,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  }));

  const summary = calculatePaymentSummary(cleanedPayments);

  const validatedResponse = GetEventPaymentsResponseSchema.parse({
    payments: cleanedPayments,
    summary,
  });

  logger.info("決済情報取得完了", {
    eventId: validatedEventId,
    userId: user.id,
    paymentCount: cleanedPayments.length,
    totalAmount: summary.totalAmount,
  });

  return validatedResponse;
}

/**
 * 決済データから集計情報を計算
 */
function calculatePaymentSummary(payments: Array<{
  method: "stripe" | "cash";
  amount: number;
  status: PaymentStatus;
}>): PaymentSummary {
  const totalPayments = payments.length;
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  // 方法別集計
  const methodMap = new Map<"stripe" | "cash", { count: number; totalAmount: number }>();

  // 初期化
  methodMap.set("stripe", { count: 0, totalAmount: 0 });
  methodMap.set("cash", { count: 0, totalAmount: 0 });

  // ステータス別集計
  const statusMap = new Map<PaymentStatus, { count: number; totalAmount: number }>();

  // 初期化
  PAYMENT_STATUS_VALUES.forEach((status) => {
    statusMap.set(status as PaymentStatus, { count: 0, totalAmount: 0 });
  });

  // 決済済み・未決済集計用
  let paidCount = 0;
  let paidAmount = 0;
  let unpaidCount = 0;
  let unpaidAmount = 0;

  // 決済済みステータス（paid, received, completed, waived）
  // waived(免除)は管理者による意図的な決済完了として扱う
  const paidStatuses = new Set<PaymentStatus>(["paid", "received", "completed", "waived"]);
  // 未決済ステータス（pending, failed, refunded）
  // refunded(返金済)は実質的に未収金のため未決済として扱う
  const unpaidStatuses = new Set<PaymentStatus>(["pending", "failed", "refunded"]);

  // 集計処理
  payments.forEach((payment) => {
    // 方法別集計
    const methodStat = methodMap.get(payment.method)!;
    methodStat.count += 1;
    methodStat.totalAmount += payment.amount;

    // ステータス別集計（未知ステータスはスキップし警告ログ）
    const statusStat = statusMap.get(payment.status);
    if (statusStat) {
      statusStat.count += 1;
      statusStat.totalAmount += payment.amount;
    } else {
      logger.warn("Unknown payment status encountered while aggregating", {
        status: payment.status,
      });
    }

    // 決済済み・未決済集計
    if (paidStatuses.has(payment.status)) {
      paidCount += 1;
      paidAmount += payment.amount;
    } else if (unpaidStatuses.has(payment.status)) {
      unpaidCount += 1;
      unpaidAmount += payment.amount;
    }
  });

  // 方法別結果配列作成
  const byMethod: PaymentMethodSummary[] = Array.from(methodMap.entries()).map(([method, stat]) => ({
    method,
    count: stat.count,
    totalAmount: stat.totalAmount,
  }));

  // ステータス別結果配列作成（0件のものも含める）
  const byStatus: PaymentStatusSummary[] = Array.from(statusMap.entries()).map(([status, stat]) => ({
    status,
    count: stat.count,
    totalAmount: stat.totalAmount,
  }));

  return {
    totalPayments,
    totalAmount,
    byMethod,
    byStatus,
    unpaidCount,
    unpaidAmount,
    paidCount,
    paidAmount,
  };
}
