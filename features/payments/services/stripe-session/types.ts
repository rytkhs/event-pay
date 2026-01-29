/**
 * Stripe Session関連の共有型定義
 */

import type { PaymentMethod, PaymentStatus } from "../types";

/**
 * 終端決済状態の定義（決済完了系の状態）
 * 注: canceledは含めない（再参加時に新しい決済を受け付けるため）
 */
export const TERMINAL_PAYMENT_STATUSES = ["paid", "received", "refunded", "waived"] as const;

/**
 * オープン決済状態の定義（処理継続可能な状態）
 */
export const OPEN_PAYMENT_STATUSES = ["pending", "failed"] as const;

export type TerminalPaymentStatus = (typeof TERMINAL_PAYMENT_STATUSES)[number];
export type OpenPaymentStatus = (typeof OPEN_PAYMENT_STATUSES)[number];

export const isTerminalPaymentStatus = (status: PaymentStatus): status is TerminalPaymentStatus => {
  return (TERMINAL_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
};

export const isOpenPaymentStatus = (status: PaymentStatus): status is OpenPaymentStatus => {
  return (OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
};

export const OPEN_PAYMENT_SELECT_COLUMNS =
  "id, status, method, amount, checkout_idempotency_key, checkout_key_revision, stripe_payment_intent_id, paid_at, created_at, updated_at";

/**
 * オープン決済レコードの型
 */
export type OpenPaymentRow = {
  id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: number;
  checkout_idempotency_key: string | null;
  checkout_key_revision: number;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * 決済レコード確保の結果
 */
export type EnsurePaymentRecordResult = {
  paymentId: string;
  idempotencyKey: string;
  checkoutKeyRevision: number;
};
