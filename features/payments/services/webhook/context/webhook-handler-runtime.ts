import { ApplicationFeeHandler } from "../handlers/application-fee-handler";
import { ChargeHandler } from "../handlers/charge-handler";
import { CheckoutSessionHandler } from "../handlers/checkout-session-handler";
import { DisputeHandler } from "../handlers/dispute-handler";
import { PaymentIntentHandler } from "../handlers/payment-intent-handler";
import { RefundHandler } from "../handlers/refund-handler";
import { DisputeWebhookRepository } from "../repositories/dispute-webhook-repository";
import { PaymentWebhookRepository } from "../repositories/payment-webhook-repository";
import { WebhookEventLedgerRepository } from "../repositories/webhook-event-ledger-repository";
import type { StripeEventRouterHandlers } from "../router/stripe-event-router";
import { PaymentAnalyticsWebhookService } from "../services/payment-analytics-service";
import { PaymentNotificationService } from "../services/payment-notification-service";
import { SettlementRegenerationService } from "../services/settlement-regeneration-service";
import { StripeObjectFetchService } from "../services/stripe-object-fetch-service";

import type { WebhookHandlerContext } from "./webhook-handler-context";

export interface WebhookHandlerRuntime {
  eventLedgerRepository: WebhookEventLedgerRepository;
  routerHandlers: StripeEventRouterHandlers;
}

export function createWebhookHandlerRuntime(context: WebhookHandlerContext): WebhookHandlerRuntime {
  const paymentRepository = new PaymentWebhookRepository(context.supabase);
  const stripeObjectFetchService = new StripeObjectFetchService();
  const paymentAnalyticsService = new PaymentAnalyticsWebhookService({
    supabase: context.supabase,
    logger: context.logger,
  });
  const paymentNotificationService = new PaymentNotificationService({
    supabase: context.supabase,
    logger: context.logger,
  });
  const settlementRegenerationService = new SettlementRegenerationService({
    supabase: context.supabase,
    logger: context.logger,
  });
  const disputeRepository = new DisputeWebhookRepository(context.supabase);

  const checkoutSessionHandler = new CheckoutSessionHandler({
    paymentRepository,
    paymentAnalyticsService,
    logger: context.logger,
  });
  const paymentIntentHandler = new PaymentIntentHandler({
    paymentRepository,
    supabase: context.supabase,
    logger: context.logger,
  });
  const chargeHandler = new ChargeHandler({
    paymentRepository,
    stripeObjectFetchService,
    paymentNotificationService,
    logger: context.logger,
  });
  const refundHandler = new RefundHandler({
    paymentRepository,
    stripeObjectFetchService,
    logger: context.logger,
    settlementRegenerationService,
  });
  const applicationFeeHandler = new ApplicationFeeHandler({
    paymentRepository,
    stripeObjectFetchService,
    logger: context.logger,
    settlementRegenerationService,
  });
  const disputeHandler = new DisputeHandler({
    paymentRepository,
    disputeRepository,
    settlementRegenerationService,
    logger: context.logger,
  });

  return {
    eventLedgerRepository: new WebhookEventLedgerRepository(context.supabase),
    routerHandlers: {
      handleRefundCreated: (event) => refundHandler.handleCreated(event),
      handleRefundUpdated: (event) => refundHandler.handleUpdated(event),
      handleRefundFailed: (event) => refundHandler.handleFailed(event),
      handlePaymentIntentSucceeded: (event) => paymentIntentHandler.handleSucceeded(event),
      handlePaymentIntentFailed: (event) => paymentIntentHandler.handleFailed(event),
      handlePaymentIntentCanceled: (event) => paymentIntentHandler.handleCanceled(event),
      handleChargeSucceeded: (event) => chargeHandler.handleSucceeded(event),
      handleChargeFailed: (event) => chargeHandler.handleFailed(event),
      handleChargeRefunded: (event) => refundHandler.handleChargeRefunded(event),
      handleCheckoutSessionCompleted: (event) => checkoutSessionHandler.handleCompleted(event),
      handleCheckoutSessionExpired: (event) => checkoutSessionHandler.handleExpired(event),
      handleCheckoutSessionAsyncPayment: (event) =>
        checkoutSessionHandler.handleAsyncPayment(event),
      handleApplicationFeeRefunded: (event) => applicationFeeHandler.handleRefunded(event),
      handleDisputeEvent: (event) => disputeHandler.handleEvent(event),
    },
  };
}
