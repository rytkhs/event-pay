import Stripe from "stripe";

import { okResult } from "@core/errors";

import type { WebhookHandlerContext } from "../context/webhook-handler-context";
import type { WebhookProcessingResult } from "../types";
import {
  isRefundCreatedCompatibleEventType,
  isRefundFailedCompatibleEventType,
  isRefundUpdatedCompatibleEventType,
} from "../webhook-event-guards";

export interface StripeEventRouterHandlers {
  handleRefundCreated(event: Stripe.Event): Promise<WebhookProcessingResult>;
  handleRefundUpdated(event: Stripe.Event): Promise<WebhookProcessingResult>;
  handleRefundFailed(event: Stripe.Event): Promise<WebhookProcessingResult>;
  handlePaymentIntentSucceeded(
    event: Stripe.PaymentIntentSucceededEvent
  ): Promise<WebhookProcessingResult>;
  handlePaymentIntentFailed(
    event: Stripe.PaymentIntentPaymentFailedEvent
  ): Promise<WebhookProcessingResult>;
  handlePaymentIntentCanceled(
    event: Stripe.PaymentIntentCanceledEvent
  ): Promise<WebhookProcessingResult>;
  handleChargeSucceeded(event: Stripe.ChargeSucceededEvent): Promise<WebhookProcessingResult>;
  handleChargeFailed(event: Stripe.ChargeFailedEvent): Promise<WebhookProcessingResult>;
  handleChargeRefunded(event: Stripe.ChargeRefundedEvent): Promise<WebhookProcessingResult>;
  handleCheckoutSessionCompleted(
    event: Stripe.CheckoutSessionCompletedEvent
  ): Promise<WebhookProcessingResult>;
  handleCheckoutSessionExpired(
    event: Stripe.CheckoutSessionExpiredEvent
  ): Promise<WebhookProcessingResult>;
  handleCheckoutSessionAsyncPayment(
    event:
      | Stripe.CheckoutSessionAsyncPaymentSucceededEvent
      | Stripe.CheckoutSessionAsyncPaymentFailedEvent
  ): Promise<WebhookProcessingResult>;
  handleApplicationFeeRefunded(event: Stripe.Event): Promise<WebhookProcessingResult>;
  handleDisputeEvent(event: Stripe.Event): Promise<WebhookProcessingResult>;
}

interface RouteStripePaymentEventParams {
  event: Stripe.Event;
  context: WebhookHandlerContext;
  handlers: StripeEventRouterHandlers;
}

export async function routeStripePaymentEvent({
  event,
  context,
  handlers,
}: RouteStripePaymentEventParams): Promise<WebhookProcessingResult> {
  if (isRefundCreatedCompatibleEventType(event.type)) {
    return handlers.handleRefundCreated(event);
  }

  if (isRefundUpdatedCompatibleEventType(event.type)) {
    return handlers.handleRefundUpdated(event);
  }

  if (isRefundFailedCompatibleEventType(event.type)) {
    return handlers.handleRefundFailed(event);
  }

  switch (event.type) {
    case "payment_intent.succeeded":
      return handlers.handlePaymentIntentSucceeded(event as Stripe.PaymentIntentSucceededEvent);

    case "payment_intent.payment_failed":
      return handlers.handlePaymentIntentFailed(event as Stripe.PaymentIntentPaymentFailedEvent);

    case "payment_intent.canceled":
      return handlers.handlePaymentIntentCanceled(event as Stripe.PaymentIntentCanceledEvent);

    case "charge.succeeded":
      return handlers.handleChargeSucceeded(event as Stripe.ChargeSucceededEvent);

    case "charge.failed":
      return handlers.handleChargeFailed(event as Stripe.ChargeFailedEvent);

    case "charge.refunded":
      return handlers.handleChargeRefunded(event as Stripe.ChargeRefundedEvent);

    case "checkout.session.completed":
      return handlers.handleCheckoutSessionCompleted(event as Stripe.CheckoutSessionCompletedEvent);

    case "checkout.session.expired":
      return handlers.handleCheckoutSessionExpired(event as Stripe.CheckoutSessionExpiredEvent);

    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      return handlers.handleCheckoutSessionAsyncPayment(
        event as
          | Stripe.CheckoutSessionAsyncPaymentSucceededEvent
          | Stripe.CheckoutSessionAsyncPaymentFailedEvent
      );

    case "application_fee.refunded":
    case "application_fee.refund.updated":
      return handlers.handleApplicationFeeRefunded(event);

    case "charge.dispute.created":
    case "charge.dispute.closed":
    case "charge.dispute.updated":
    case "charge.dispute.funds_reinstated":
      return handlers.handleDisputeEvent(event);

    // payments責務イベントのみを処理する。
    // Connectアカウント運用イベント（account.updated / account.application.deauthorized / payout.*）は
    // stripe-connect ドメインで処理し、この router では扱わない。

    // Destination chargesでは transfer.* は不使用
    case "transfer.created":
    case "transfer.updated":
    case "transfer.reversed":
      return okResult();

    default:
      context.logger.warn("Unsupported webhook event type", {
        event_type: event.type,
        event_id: event.id,
        outcome: "success",
      });
      return okResult();
  }
}
