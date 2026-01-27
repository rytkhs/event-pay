/**
 * Core Services Abstraction Layer
 * features間の境界違反を解消するための抽象化層
 */

// Payment Actions抽象化
export {
  type PaymentActionsPort,
  type UpdateCashStatusParams,
  type BulkUpdateCashStatusParams,
  type BulkUpdateResult,
  createPaymentActions,
  getPaymentActions,
} from "./payment-actions";

// Payment Service抽象化
export {
  type PaymentServicePort,
  type PaymentErrorHandlerPort,
  createPaymentService,
  createPaymentErrorHandler,
  getPaymentService,
  getPaymentErrorHandler,
  // 型のexport
  type CreateStripeSessionParams,
  type CreateStripeSessionResult,
  type CreateCashPaymentParams,
  type CreateCashPaymentResult,
  type UpdatePaymentStatusParams,
  type PaymentError,
  PaymentErrorType,
  type ErrorHandlingResult,
} from "./payment-service";

// Settlement Service抽象化
export {
  type SettlementServicePort,
  createSettlementService,
  getSettlementService,
} from "./settlement-service";
