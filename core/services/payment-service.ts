/**
 * Core Payment Service Abstraction
 * features間の境界違反を解消するための決済サービス抽象化層
 */

import { getPaymentPort, PaymentErrorType } from "@core/ports/payments";
import type {
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
  ErrorHandlingResult,
  PaymentError,
} from "@core/ports/payments";

export { PaymentErrorType };
export type {
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
  ErrorHandlingResult,
  PaymentError,
};

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

// Factory functions - uses port instead of dynamic imports
export function createPaymentService(): PaymentServicePort {
  return {
    async createStripeSession(params: CreateStripeSessionParams) {
      const port = getPaymentPort();
      return port.createStripeSession(params);
    },

    async createCashPayment(params: CreateCashPaymentParams) {
      const port = getPaymentPort();
      return port.createCashPayment(params);
    },

    async updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void> {
      const port = getPaymentPort();
      await port.updatePaymentStatus(params);
    },
  };
}

export function createPaymentErrorHandler(): PaymentErrorHandlerPort {
  return {
    handleError(error: unknown) {
      const port = getPaymentPort();
      return port.handleError(error);
    },

    mapToUserFriendlyMessage(error: unknown) {
      const port = getPaymentPort();
      return port.mapToUserFriendlyMessage(error);
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
