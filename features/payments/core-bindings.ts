/**
 * Core Services Registration
 * features/payments の実装を core/services registry に登録する
 */

import paymentRegistry from "@core/services/payment-registry";
import { createClient } from "@core/supabase/server";

import { updateCashStatusAction, bulkUpdateCashStatusAction } from "./actions";
import { PaymentService, PaymentErrorHandler } from "./services";

// Payment Actions Implementation
const paymentActionsImpl = {
  updateCashStatus: updateCashStatusAction,
  bulkUpdateCashStatus: bulkUpdateCashStatusAction,
};

// Payment Service Instance
let paymentServiceInstance: PaymentService | null = null;

const paymentServiceImpl = {
  async createStripeSession(params: any) {
    if (!paymentServiceInstance) {
      // Get secure Supabase client and error handler for constructor
      const supabaseClient = createClient();
      const errorHandler = new PaymentErrorHandler();
      paymentServiceInstance = new PaymentService(supabaseClient, errorHandler);
    }
    return paymentServiceInstance.createStripeSession(params);
  },

  async createCashPayment(params: any) {
    if (!paymentServiceInstance) {
      const supabaseClient = createClient();
      const errorHandler = new PaymentErrorHandler();
      paymentServiceInstance = new PaymentService(supabaseClient, errorHandler);
    }
    return paymentServiceInstance.createCashPayment(params);
  },

  async updatePaymentStatus(params: any) {
    if (!paymentServiceInstance) {
      const supabaseClient = createClient();
      const errorHandler = new PaymentErrorHandler();
      paymentServiceInstance = new PaymentService(supabaseClient, errorHandler);
    }
    try {
      await paymentServiceInstance.updatePaymentStatus(params);
      return { success: true as const, data: null };
    } catch (error: any) {
      return {
        success: false as const,
        error: error.message || "Unknown error",
        code: "INTERNAL_ERROR" as any,
      };
    }
  },
};

// Payment Error Handler Instance
let paymentErrorHandlerInstance: PaymentErrorHandler | null = null;

const paymentErrorHandlerImpl = {
  handleError(error: unknown) {
    if (!paymentErrorHandlerInstance) {
      paymentErrorHandlerInstance = new PaymentErrorHandler();
    }
    // Convert PaymentError to ErrorHandlingResult
    const paymentError =
      error && typeof error === "object" && "type" in error
        ? (error as any)
        : {
            type: "UNKNOWN_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
            details: error,
          };

    return {
      error: paymentError,
      userMessage:
        error && typeof error === "object" && "type" in error
          ? "お支払い処理中にエラーが発生しました。"
          : "予期しないエラーが発生しました。",
    };
  },

  mapToUserFriendlyMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      return (error as Error).message;
    }
    return "予期しないエラーが発生しました。管理者にお問い合わせください。";
  },
};

// Registration function
export function registerPaymentImplementations(): void {
  paymentRegistry.registerPaymentActions(paymentActionsImpl);
  paymentRegistry.registerPaymentService(paymentServiceImpl);
  paymentRegistry.registerPaymentErrorHandler(paymentErrorHandlerImpl);
}

// Auto-registration (called when this module is imported)
registerPaymentImplementations();
