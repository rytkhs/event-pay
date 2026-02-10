import "server-only";

import { PaymentError, PaymentErrorHandlingResult } from "@core/types/payment-errors";
import { handleServerError } from "@core/utils/error-handler.server";

import { ERROR_HANDLING_BY_TYPE } from "./error-mapping";
import { IPaymentErrorHandler } from "./interface";

/**
 * PaymentErrorHandlerの実装クラス
 */
export class PaymentErrorHandler implements IPaymentErrorHandler {
  /**
   * 決済エラーを処理し、適切な対応を決定する
   */
  async handlePaymentError(error: PaymentError): Promise<PaymentErrorHandlingResult> {
    return (
      ERROR_HANDLING_BY_TYPE[error.type] ?? {
        userMessage: "予期しないエラーが発生しました。管理者にお問い合わせください。",
        shouldRetry: false,
        logLevel: "error",
      }
    );
  }

  /**
   * エラーをログに記録する
   */
  async logError(error: PaymentError, context?: Record<string, unknown>): Promise<void> {
    const stripeRequestId =
      error.cause && typeof error.cause === "object" && "requestId" in error.cause
        ? (error.cause as { requestId?: string }).requestId
        : undefined;

    const logData = {
      error_type: error.type,
      message: error.message,
      stack: error.stack,
      stripe_request_id: stripeRequestId,
      context,
    };

    handleServerError("PAYMENT_OPERATION_FAILED", {
      category: "payment",
      action: "payment_error_handler",
      additionalData: logData,
    });
  }
}
