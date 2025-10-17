/**
 * Core Events System
 * Event-Driven Architectureによる境界違反解消
 */

export {
  type PaymentWebhookEvent,
  type StripeAccountEvent,
  type PaymentEventHandler,
  type StripeAccountEventHandler,
  getEventRegistry,
  emitPaymentCompleted,
  emitPaymentFailed,
  emitStripeAccountUpdated,
} from "./payment-events";

export { setupEventHandlers } from "./setup";
