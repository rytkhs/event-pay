/**
 * 決済サービス関連の型定義
 */

import { PAYMENT_STATUS_VALUES } from "@core/constants/statuses";
import type {
  CreateCashPaymentParams,
  CreateStripeSessionParams,
  UpdatePaymentStatusParams,
} from "@core/ports/payments";
import type { PaymentMethod, PaymentStatus } from "@core/types/statuses";

export type { PaymentMethod, PaymentStatus };
export type { CreateStripeSessionParams, CreateCashPaymentParams, UpdatePaymentStatusParams };

// 決済ステータスのType Guard
// [WARNING] DBのenum (payment_status_enum) が変更された場合、ここも必ず更新してください
export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && PAYMENT_STATUS_VALUES.includes(value as PaymentStatus);
}

// 決済レコードの型（データベーススキーマに合わせる）
export interface Payment {
  id: string;
  attendance_id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  stripe_payment_intent_id?: string | null;
  webhook_event_id?: string | null;
  webhook_processed_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

// Stripe決済セッション作成結果
export interface CreateStripeSessionResult {
  sessionUrl: string;
  sessionId: string;
}

// 現金決済作成結果
export interface CreateCashPaymentResult {
  paymentId: string;
}

// Port契約（paidAt: string）とService内部処理（paidAt: Date）の境界を明示する内部型
export type ServiceUpdatePaymentStatusParams = Omit<UpdatePaymentStatusParams, "paidAt"> & {
  paidAt?: Date;
};
