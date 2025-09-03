/**
 * Core Payment Service Abstraction
 * features間の境界違反を解消するための決済サービス抽象化層
 */

import registry from "./payment-registry";

// Dynamic import用の型定義（to avoid circular dependencies）
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

// PaymentService インターフェースの抽象化
export interface PaymentServicePort {
  createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult>;
  createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult>;
  updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void>;
}

// PaymentErrorHandler インターフェースの抽象化
export interface PaymentErrorHandlerPort {
  handleError(error: unknown): ErrorHandlingResult;
  mapToUserFriendlyMessage(error: unknown): string;
}

// Factory functions - uses registry instead of dynamic imports
export function createPaymentService(): PaymentServicePort {
  return {
    async createStripeSession(params: CreateStripeSessionParams) {
      const impl = registry.getPaymentService();
      return impl.createStripeSession(params);
    },

    async createCashPayment(params: CreateCashPaymentParams) {
      const impl = registry.getPaymentService();
      return impl.createCashPayment(params);
    },

    async updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void> {
      const impl = registry.getPaymentService();
      await impl.updatePaymentStatus(params);
    },
  };
}

export function createPaymentErrorHandler(): PaymentErrorHandlerPort {
  return {
    handleError(error: unknown) {
      const impl = registry.getPaymentErrorHandler();
      return impl.handleError(error);
    },

    mapToUserFriendlyMessage(error: unknown) {
      const impl = registry.getPaymentErrorHandler();
      return impl.mapToUserFriendlyMessage(error);
    },
  };
}

// Singleton instances
let paymentServiceInstance: PaymentServicePort | null = null;
let paymentErrorHandlerInstance: PaymentErrorHandlerPort | null = null;

export function getPaymentService(): PaymentServicePort {
  if (!paymentServiceInstance) {
    paymentServiceInstance = createPaymentService();
  }
  return paymentServiceInstance;
}

export function getPaymentErrorHandler(): PaymentErrorHandlerPort {
  if (!paymentErrorHandlerInstance) {
    paymentErrorHandlerInstance = createPaymentErrorHandler();
  }
  return paymentErrorHandlerInstance;
}
