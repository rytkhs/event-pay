import { Database } from "@/types/database";

// Database row type for payments table
export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

// UI / 集計処理向けに使いやすいステータスを返す
export type ComputedPaymentStatus =
  | "pending"
  | "paid"
  | "partial_refund"
  | "refunded"
  | "failed"
  | "received"
  | "completed"
  | "waived";

/**
 * 決済のステータスを返金額を考慮して判定するユーティリティ
 * - partial_refund: status = paid かつ refunded_amount > 0 かつ refunded_amount < amount
 * - refunded       : status = refunded もしくは refunded_amount >= amount
 * - それ以外       : DBの status をそのまま返す
 */
export function getComputedPaymentStatus(payment: PaymentRow): ComputedPaymentStatus {
  const refunded = payment.refunded_amount ?? 0;
  const amount = payment.amount ?? 0;

  // 全額返金判定
  if (refunded > 0 && refunded >= amount) {
    return "refunded";
  }

  // 部分返金判定
  if (payment.status === "paid" && refunded > 0 && refunded < amount) {
    return "partial_refund";
  }

  // その他はDBのステータスをそのまま返す
  return payment.status as ComputedPaymentStatus;
}

/**
 * 実質受領額（返金後）を計算する
 */
export function calcNetPaidAmount(payment: PaymentRow): number {
  const refunded = payment.refunded_amount ?? 0;
  return Math.max(payment.amount - refunded, 0);
}
