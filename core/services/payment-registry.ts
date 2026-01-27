/**
 * Payment Implementation Registry
 * Dependency Injection pattern for core ↔ features decoupling
 */

import type {
  UpdateCashStatusParams,
  BulkUpdateCashStatusParams,
  BulkUpdateResult,
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
  ErrorHandlingResult,
} from "@core/ports/payments";
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
  updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void>;
}

export interface PaymentErrorHandlerImpl {
  handleError(error: unknown): ErrorHandlingResult;
  mapToUserFriendlyMessage(error: unknown): string;
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
