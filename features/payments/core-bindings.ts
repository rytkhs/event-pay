/**
 * Core Services Registration
 * features/payments の実装を core/services registry に登録する
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import paymentRegistry from "@core/services/payment-registry";

import { updateCashStatusAction, bulkUpdateCashStatusAction } from "./actions";
import { PaymentService, PaymentErrorHandler } from "./services";

// Payment Actions Implementation
const paymentActionsImpl = {
  updateCashStatus: updateCashStatusAction,
  bulkUpdateCashStatus: bulkUpdateCashStatusAction,
};

const paymentServiceImpl = {
  async createStripeSession(params: any) {
    // Stripe決済セッション作成時はAdminクライアントを使用（RLS回避のため）
    const factory = SecureSupabaseClientFactory.create();
    const adminClient = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "features/payments/core-bindings createStripeSession"
    );
    const errorHandler = new PaymentErrorHandler();
    const paymentService = new PaymentService(adminClient, errorHandler);
    return paymentService.createStripeSession(params);
  },

  async createCashPayment(params: any) {
    // 現金決済レコード作成は管理者（service_role）クライアントで実行
    const factory = SecureSupabaseClientFactory.create();
    const adminClient = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "features/payments/core-bindings createCashPayment"
    );
    const errorHandler = new PaymentErrorHandler();
    const paymentService = new PaymentService(adminClient, errorHandler);
    return paymentService.createCashPayment(params);
  },

  async updatePaymentStatus(params: any) {
    try {
      // 決済ステータス更新は管理者（service_role）クライアントで実行
      const factory = SecureSupabaseClientFactory.create();
      const adminClient = await factory.createAuditedAdminClient(
        AdminReason.PAYMENT_PROCESSING,
        "features/payments/core-bindings updatePaymentStatus"
      );
      const errorHandler = new PaymentErrorHandler();
      const paymentService = new PaymentService(adminClient, errorHandler);
      await paymentService.updatePaymentStatus(params);
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
