/**
 * Payments Port Interface
 * Core層からPayments機能にアクセスするためのポートインターフェース
 */

import type { ServerActionResult } from "@core/types/server-actions";

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
  status: string;
  paidAt?: string;
  stripePaymentIntentId?: string;
}

export interface ErrorHandlingResult {
  error: PaymentError;
  userMessage: string;
}

export interface PaymentError {
  type: PaymentErrorType;
  message: string;
  details?: unknown;
}

export enum PaymentErrorType {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  PAYMENT_ALREADY_EXISTS = "PAYMENT_ALREADY_EXISTS",
  STRIPE_ERROR = "STRIPE_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export interface PaymentPort {
  updateCashStatus(params: UpdateCashStatusParams): Promise<ServerActionResult<any>>;
  bulkUpdateCashStatus(
    params: BulkUpdateCashStatusParams
  ): Promise<ServerActionResult<BulkUpdateResult>>;

  createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult>;
  createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult>;
  updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void>;

  handleError(error: unknown): ErrorHandlingResult;
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
