"use server";

import type { z } from "zod";

import { verifyEventAccess, handleDatabaseError } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import {
  PaymentStatusEnum,
  GetEventPaymentsResponseSchema,
  PAYMENT_STATUS_VALUES,
  type GetEventPaymentsResponse,
  type PaymentMethodSummary,
  type PaymentStatusSummary,
  type PaymentSummary,
} from "@core/validation/participant-management";

type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

/**
 * イベント決済情報取得（集計付き）
 * MANAGE-002: 決済状況確認/集計
 */
export async function getEventPaymentsAction(eventId: string): Promise<GetEventPaymentsResponse> {
  // 認可チェック
  const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

  const supabase = createClient();

  // 決済データ取得（attendance.statusも含める）
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
      attendances!inner(event_id, status)
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
    attendance_status: payment.attendances.status,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  }));

  // 各参加者(attendance_id)につき最新の決済1件のみを抽出
  // paid_at DESC NULLS LAST → created_at DESC → updated_at DESC 相当のロジック
  const latestPaymentsMap = new Map<string, (typeof cleanedPayments)[number]>();
  cleanedPayments.forEach((payment) => {
    const existing = latestPaymentsMap.get(payment.attendance_id);
    if (!existing) {
      latestPaymentsMap.set(payment.attendance_id, payment);
      return;
    }
    // 比較関数：paid_at (null は最古扱い), その後 created_at, updated_at
    // ISO 文字列ではなく Date オブジェクトのタイムスタンプで比較
    const paidAtA = payment.paid_at ? new Date(payment.paid_at).getTime() : -Infinity; // null は最古扱い
    const paidAtB = existing.paid_at ? new Date(existing.paid_at).getTime() : -Infinity;

    if (paidAtA !== paidAtB) {
      if (paidAtA > paidAtB) {
        latestPaymentsMap.set(payment.attendance_id, payment);
      }
      return;
    }

    const createdAtA = new Date(payment.created_at).getTime();
    const createdAtB = new Date(existing.created_at).getTime();
    if (createdAtA !== createdAtB) {
      if (createdAtA > createdAtB) {
        latestPaymentsMap.set(payment.attendance_id, payment);
      }
      return;
    }

    const updatedAtA = new Date(payment.updated_at).getTime();
    const updatedAtB = new Date(existing.updated_at).getTime();
    if (updatedAtA > updatedAtB) {
      latestPaymentsMap.set(payment.attendance_id, payment);
    }
  });

  const latestPayments = Array.from(latestPaymentsMap.values());

  const summary = calculatePaymentSummary(latestPayments);

  const validatedResponse = GetEventPaymentsResponseSchema.parse({
    payments: latestPayments,
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
 *
 * 設計方針（会計原則に基づく）:
 * - 入金があれば参加状態に関わらず売上として計上
 * - 売上の内訳（参加者分/キャンセル分）は UI 側で判別
 * - キャンセル後決済分は将来的にキャンセル料として扱える
 */
function calculatePaymentSummary(
  payments: Array<{
    method: "stripe" | "cash";
    amount: number;
    status: PaymentStatus;
    attendance_status: "attending" | "not_attending" | "maybe";
  }>
): PaymentSummary {
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

  // 決済済みステータス（paid, received, waived）
  // waived(免除)は管理者による意図的な決済完了として扱う
  const paidStatuses = new Set<PaymentStatus>(["paid", "received", "waived"]);
  // 未決済ステータス（pending, failed のみ）
  // canceled/refunded は会計上の終端であり、収益・未収いずれにも含めない
  const unpaidStatuses = new Set<PaymentStatus>(["pending", "failed"]);

  // 集計処理
  payments.forEach((payment) => {
    // 方法別集計
    const methodStat = methodMap.get(payment.method) as { count: number; totalAmount: number };
    methodStat.count += 1;
    methodStat.totalAmount += payment.amount;

    // ステータス別集計（未知ステータスはスキップ）
    const statusStat = statusMap.get(payment.status);
    if (statusStat) {
      statusStat.count += 1;
      statusStat.totalAmount += payment.amount;
    }

    // 決済済み・未決済集計（参加状態に関わらず）
    // 会計原則: 入金があれば売上として計上
    if (paidStatuses.has(payment.status)) {
      paidCount += 1;
      paidAmount += payment.amount;
    } else if (unpaidStatuses.has(payment.status)) {
      unpaidCount += 1;
      unpaidAmount += payment.amount;
    }
    // terminal statuses are tracked via statusMap and excluded from unpaid
  });

  // 方法別結果配列作成
  const byMethod: PaymentMethodSummary[] = Array.from(methodMap.entries()).map(
    ([method, stat]) => ({
      method,
      count: stat.count,
      totalAmount: stat.totalAmount,
    })
  );

  // ステータス別結果配列作成（0件のものも含める）
  const byStatus: PaymentStatusSummary[] = Array.from(statusMap.entries()).map(
    ([status, stat]) => ({
      status,
      count: stat.count,
      totalAmount: stat.totalAmount,
    })
  );

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
