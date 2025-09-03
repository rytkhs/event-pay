/**
 * Payment Implementation Registry
 * Dependency Injection pattern for core ↔ features decoupling
 */

import type { ServerActionResult } from "@core/types/server-actions";

// Registry interfaces
export interface PaymentActionsImpl {
  updateCashStatus(params: UpdateCashStatusParams): Promise<ServerActionResult<any>>;
  bulkUpdateCashStatus(
    params: BulkUpdateCashStatusParams
  ): Promise<ServerActionResult<BulkUpdateResult>>;
}

export interface PaymentServiceImpl {
  createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult>;
  createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult>;
  updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<ServerActionResult<any>>;
}

export interface PaymentErrorHandlerImpl {
  handleError(error: unknown): ErrorHandlingResult;
  mapToUserFriendlyMessage(error: unknown): string;
}

// Type definitions
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

// Global registry
class PaymentImplementationRegistry {
  private paymentActions: PaymentActionsImpl | null = null;
  private paymentService: PaymentServiceImpl | null = null;
  private paymentErrorHandler: PaymentErrorHandlerImpl | null = null;

  // Registration methods
  registerPaymentActions(impl: PaymentActionsImpl): void {
    this.paymentActions = impl;
  }

  registerPaymentService(impl: PaymentServiceImpl): void {
    this.paymentService = impl;
  }

  registerPaymentErrorHandler(impl: PaymentErrorHandlerImpl): void {
    this.paymentErrorHandler = impl;
  }

  // Getter methods with error handling
  getPaymentActions(): PaymentActionsImpl {
    if (!this.paymentActions) {
      throw new Error(
        "PaymentActions implementation not registered. Call registerPaymentActions() first."
      );
    }
    return this.paymentActions;
  }

  getPaymentService(): PaymentServiceImpl {
    if (!this.paymentService) {
      throw new Error(
        "PaymentService implementation not registered. Call registerPaymentService() first."
      );
    }
    return this.paymentService;
  }

  getPaymentErrorHandler(): PaymentErrorHandlerImpl {
    if (!this.paymentErrorHandler) {
      throw new Error(
        "PaymentErrorHandler implementation not registered. Call registerPaymentErrorHandler() first."
      );
    }
    return this.paymentErrorHandler;
  }

  // Development/testing helper
  isRegistered(): boolean {
    return !!(this.paymentActions && this.paymentService && this.paymentErrorHandler);
  }
}

// Singleton instance
const registry = new PaymentImplementationRegistry();

export default registry;
