/**
 * Payments Port Interface
 * Core層からPayments機能にアクセスするためのポートインターフェース
 */

import type { ActionResult } from "@core/errors/adapters/server-actions";
import {
  PaymentErrorType,
  PaymentError as SharedPaymentError,
  type PaymentErrorHandlingResult,
} from "@core/types/payment-errors";
import type { PaymentStatus } from "@core/types/statuses";

export type PaymentStatusValue = PaymentStatus;

export interface UpdateCashStatusParams {
  paymentId: string;
  status: "received" | "waived";
  notes?: string;
}

export interface BulkUpdateCashStatusParams {
  paymentIds: string[];
  status: "received" | "waived";
  notes?: string;
}

export interface BulkUpdateResult {
  successCount: number;
  failedCount: number;
  failures: Array<{
    paymentId: string;
    error: string;
  }>;
}

export interface CreateStripeSessionParams {
  attendanceId: string;
  amount: number;
  eventId: string;
  actorId: string;
  eventTitle: string;
  successUrl: string;
  cancelUrl: string;
  /** GA4 Client ID（アナリティクス追跡用） */
  gaClientId?: string;
  transferGroup?: string;
  /**
   * Destination charges用パラメータ
   */
  destinationCharges?: {
    /** 送金先のStripe Connect アカウントID (acct_...) */
    destinationAccountId: string;
    /** ユーザーのメールアドレス（Customer作成用） */
    userEmail?: string;
    /** ユーザー名（Customer作成用） */
    userName?: string;
    /**
     * Checkout Session で将来のオフセッション決済用にカード情報を保存するかどうか
     * @see https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-payment_intent_data-setup_future_usage
     */
    setupFutureUsage?: "off_session";
  };
}

export interface CreateStripeSessionResult {
  sessionId: string;
  sessionUrl: string;
}

export interface CreateCashPaymentParams {
  attendanceId: string;
  amount: number;
}

export interface CreateCashPaymentResult {
  paymentId: string;
}

export interface UpdatePaymentStatusParams {
  paymentId: string;
  status: PaymentStatusValue;
  paidAt?: string;
  stripePaymentIntentId?: string;
  expectedVersion?: number;
  userId?: string;
  notes?: string;
}

export { SharedPaymentError as PaymentError, PaymentErrorType };

export interface PaymentPort {
  updateCashStatus(
    params: UpdateCashStatusParams
  ): Promise<ActionResult<{ paymentId: string; status: "received" | "waived" | "pending" }>>;
  bulkUpdateCashStatus(params: BulkUpdateCashStatusParams): Promise<ActionResult<BulkUpdateResult>>;

  createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult>;
  createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult>;
  updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void>;

  handleError(error: unknown): PaymentErrorHandlingResult;
  mapToUserFriendlyMessage(error: unknown): string;
}

// Port Registration System
let paymentPort: PaymentPort | null = null;

export function registerPaymentPort(impl: PaymentPort): void {
  paymentPort = impl;
}

export function getPaymentPort(): PaymentPort {
  if (!paymentPort) {
    throw new Error("PaymentPort not registered. Please register payments adapter first.");
  }
  return paymentPort;
}

export function isPaymentPortRegistered(): boolean {
  return paymentPort !== null;
}
