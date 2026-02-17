/**
 * Payment Port Adapter
 * Core層のポートインターフェースにPayments機能を提供するアダプタ
 */

import {
  registerPaymentPort,
  PaymentPort,
  CreateStripeSessionParams as CoreCreateStripeSessionParams,
  CreateCashPaymentParams as CoreCreateCashPaymentParams,
  UpdatePaymentStatusParams as CoreUpdatePaymentStatusParams,
  PaymentError as CorePaymentError,
  PaymentErrorType,
} from "@core/ports/payments";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { PaymentErrorHandlingResult } from "@core/types/payment-errors";
import { toErrorLike } from "@core/utils/type-guards";

import { bulkUpdateCashStatusAction } from "../actions/bulk-update-cash-status";
import { updateCashStatusAction } from "../actions/update-cash-status";
import { ERROR_HANDLING_BY_TYPE } from "../services/error-mapping";
import { PaymentErrorHandler } from "../services/payment-error-handler";
import { PaymentService } from "../services/service";
import { isPaymentStatus } from "../types";

// Payment Actions Implementation
const paymentActionsImpl = {
  updateCashStatus: updateCashStatusAction,
  bulkUpdateCashStatus: bulkUpdateCashStatusAction,
};

const paymentServiceImpl: Pick<
  PaymentPort,
  "createStripeSession" | "createCashPayment" | "updatePaymentStatus"
> = {
  async createStripeSession(params: CoreCreateStripeSessionParams) {
    // Stripe決済セッション作成時はAdminクライアントを使用（RLS回避のため）
    const factory = getSecureClientFactory();
    const adminClient = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "features/payments/adapters/payment-port.adapter createStripeSession"
    );
    const errorHandler = new PaymentErrorHandler();
    const paymentService = new PaymentService(adminClient, errorHandler);
    return paymentService.createStripeSession(params);
  },

  async createCashPayment(params: CoreCreateCashPaymentParams) {
    // 現金決済レコード作成は管理者（service_role）クライアントで実行
    const factory = getSecureClientFactory();
    const adminClient = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "features/payments/adapters/payment-port.adapter createCashPayment"
    );
    const errorHandler = new PaymentErrorHandler();
    const paymentService = new PaymentService(adminClient, errorHandler);
    return paymentService.createCashPayment(params);
  },

  async updatePaymentStatus(params: CoreUpdatePaymentStatusParams) {
    // Validate status
    if (!isPaymentStatus(params.status)) {
      throw new CorePaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        `Invalid payment status: ${params.status}`
      );
    }

    const paidAt = params.paidAt ? new Date(params.paidAt) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) {
      throw new CorePaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        `Invalid paidAt: ${params.paidAt}`
      );
    }

    // 決済ステータス更新は管理者（service_role）クライアントで実行
    const factory = getSecureClientFactory();
    const adminClient = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "features/payments/adapters/payment-port.adapter updatePaymentStatus"
    );
    const errorHandler = new PaymentErrorHandler();
    const paymentService = new PaymentService(adminClient, errorHandler);

    // Convert Core params (Primitives) to Feature params (Domain Objects)
    await paymentService.updatePaymentStatus({
      paymentId: params.paymentId,
      status: params.status,
      paidAt,
      stripePaymentIntentId: params.stripePaymentIntentId,
      expectedVersion: params.expectedVersion,
      userId: params.userId,
      notes: params.notes,
    });
  },
};

// Payment Error Handler Instance
let paymentErrorHandlerInstance: PaymentErrorHandler | null = null;

const paymentErrorHandlerImpl = {
  handleError(error: unknown): PaymentErrorHandlingResult {
    if (!paymentErrorHandlerInstance) {
      paymentErrorHandlerInstance = new PaymentErrorHandler();
    }

    let paymentError: CorePaymentError;

    if (error instanceof CorePaymentError) {
      paymentError = error;
    } else {
      const errorLike = toErrorLike(error);
      const normalizedType =
        errorLike.type &&
        Object.values(PaymentErrorType).includes(errorLike.type as PaymentErrorType)
          ? (errorLike.type as PaymentErrorType)
          : undefined;

      if (normalizedType) {
        // Reconstitute CorePaymentError from structured object
        paymentError = new CorePaymentError(
          normalizedType,
          errorLike.message || "Unknown error",
          errorLike.cause ?? errorLike.details ?? error
        );
      } else {
        // Fallback for unknown errors
        paymentError = new CorePaymentError(
          PaymentErrorType.UNKNOWN_ERROR,
          error instanceof Error ? error.message : "Unknown error",
          error
        );
      }
    }

    const handling =
      ERROR_HANDLING_BY_TYPE[paymentError.type] ??
      (error instanceof CorePaymentError || (error && typeof error === "object" && "type" in error)
        ? {
            userMessage: "お支払い処理中にエラーが発生しました。",
            shouldRetry: false,
            logLevel: "error",
          }
        : {
            userMessage: "予期しないエラーが発生しました。",
            shouldRetry: false,
            logLevel: "error",
          });

    return handling;
  },

  mapToUserFriendlyMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      return (error as Error).message;
    }
    return "予期しないエラーが発生しました。管理者にお問い合わせください。";
  },
};

/**
 * Payments機能のアダプタを登録
 */
export function registerPaymentAdapters(): void {
  registerPaymentPort({
    ...paymentActionsImpl,
    ...paymentServiceImpl,
    ...paymentErrorHandlerImpl,
  });
}
