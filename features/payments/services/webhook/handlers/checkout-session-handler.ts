import Stripe from "stripe";

import { okResult } from "@core/errors";
import { getMetadata, getPaymentIntentId } from "@core/stripe/guards";
import type { PaymentStatus } from "@core/types/statuses";
import { handleServerError } from "@core/utils/error-handler.server";
import { maskSessionId } from "@core/utils/mask";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

import type { WebhookContextLogger } from "../context/webhook-handler-context";
import { createWebhookDbError } from "../errors/webhook-error-factory";
import { PaymentWebhookRepository } from "../repositories/payment-webhook-repository";
import { PaymentAnalyticsWebhookService } from "../services/payment-analytics-service";
import type { WebhookProcessingResult } from "../types";

interface CheckoutSessionHandlerParams {
  paymentRepository: PaymentWebhookRepository;
  paymentAnalyticsService: PaymentAnalyticsWebhookService;
  logger: WebhookContextLogger;
}

export class CheckoutSessionHandler {
  private readonly paymentRepository: PaymentWebhookRepository;
  private readonly paymentAnalyticsService: PaymentAnalyticsWebhookService;
  private readonly logger: WebhookContextLogger;

  constructor(params: CheckoutSessionHandlerParams) {
    this.paymentRepository = params.paymentRepository;
    this.paymentAnalyticsService = params.paymentAnalyticsService;
    this.logger = params.logger;
  }

  async handleCompleted(
    event: Stripe.CheckoutSessionCompletedEvent
  ): Promise<WebhookProcessingResult> {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      const sessionId: string = session.id;
      const paymentIntentId = getPaymentIntentId(session);
      const metadata = getMetadata(session);
      const paymentIdFromMetadata = metadata?.["payment_id"] || null;

      if (!paymentIdFromMetadata) {
        handleServerError("WEBHOOK_INVALID_PAYLOAD", {
          action: "processCheckoutSession",
          additionalData: {
            eventId: event.id,
            sessionId: maskSessionId(sessionId),
            detail: "Missing payment_id in metadata",
          },
        });
        return okResult();
      }

      const payment = await this.paymentRepository.findById(paymentIdFromMetadata);
      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "processCheckoutSession",
          additionalData: {
            eventId: event.id,
            sessionId: maskSessionId(sessionId),
            paymentIdFromMetadata,
          },
        });
        return okResult();
      }

      if (payment.stripe_checkout_session_id === sessionId) {
        this.logger.info("Checkout session already linked (duplicate)", {
          event_id: event.id,
          payment_id: payment.id,
          session_id: maskSessionId(sessionId),
          outcome: "success",
        });
        return okResult();
      }

      const { error: updateError } = await this.paymentRepository.saveCheckoutSessionLink({
        paymentId: payment.id,
        sessionId,
        paymentIntentId,
      });

      if (updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "processCheckoutSession",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            sessionId: maskSessionId(sessionId),
            error_message: updateError.message,
            error_code: updateError.code,
          },
        });
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "checkout_session_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "決済ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            sessionId: maskSessionId(sessionId),
          },
        });
      }

      this.logger.info("Checkout session processed successfully", {
        event_id: event.id,
        session_id: maskSessionId(sessionId),
        payment_id: payment.id,
        payment_intent_id: paymentIntentId ?? undefined,
        outcome: "success",
      });

      const gaClientId = metadata?.["ga_client_id"] || null;
      if (!gaClientId) {
        this.logger.debug("[GA4] No GA4 Client ID in checkout session metadata", {
          session_id: maskSessionId(sessionId),
          payment_id: payment.id,
          outcome: "success",
        });
        return okResult();
      }

      await this.paymentAnalyticsService.trackCheckoutCompletion({
        paymentId: payment.id,
        attendanceId: payment.attendance_id,
        sessionId,
        gaClientId,
        amount: payment.amount,
      });

      return okResult();
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  async handleExpired(event: Stripe.CheckoutSessionExpiredEvent): Promise<WebhookProcessingResult> {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      const sessionId: string = session.id;
      const rawPi = session.payment_intent;
      const paymentIntentId: string | null =
        typeof rawPi === "string" && rawPi.length > 0 ? rawPi : null;

      const metadata = getMetadata(session);
      const payment = await this.paymentRepository.resolveCheckoutTarget({
        checkoutSessionId: sessionId,
        metadataPaymentId:
          typeof metadata?.["payment_id"] === "string" ? metadata["payment_id"] : null,
      });

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "processCheckoutSessionExpired",
          additionalData: { eventId: event.id, sessionId: maskSessionId(sessionId) },
        });
        return okResult();
      }

      if (!canPromoteStatus(payment.status as PaymentStatus, "failed")) {
        this.logger.info("Status promotion rule preventing update", {
          event_id: event.id,
          payment_id: payment.id,
          current_status: payment.status,
          outcome: "success",
        });
        return okResult();
      }

      const { error: updateError } =
        await this.paymentRepository.updateStatusFailedFromCheckoutSession({
          paymentId: payment.id,
          eventId: event.id,
          checkoutSessionId: sessionId,
          paymentIntentId,
        });
      if (updateError) {
        handleServerError("STRIPE_CHECKOUT_SESSION_EXPIRED_UPDATE_FAILED", {
          action: "processCheckoutSessionExpired",
          additionalData: {
            eventId: event.id,
            sessionId: maskSessionId(sessionId),
            error_message: updateError.message,
            error_code: updateError.code,
            payment_id: payment.id,
          },
        });
        return createWebhookDbError({
          code: "STRIPE_CHECKOUT_SESSION_EXPIRED_UPDATE_FAILED",
          reason: "checkout_status_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "決済ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            sessionId: maskSessionId(sessionId),
          },
        });
      }

      this.logger.info("Checkout session expiration processed", {
        event_id: event.id,
        payment_id: payment.id,
        session_id: maskSessionId(sessionId),
        payment_intent_id: paymentIntentId ?? undefined,
        outcome: "success",
      });
      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  async handleAsyncPayment(
    event:
      | Stripe.CheckoutSessionAsyncPaymentSucceededEvent
      | Stripe.CheckoutSessionAsyncPaymentFailedEvent
  ): Promise<WebhookProcessingResult> {
    this.logger.info("Webhook event received (async payment)", {
      event_id: event.id,
      event_type: event.type,
    });
    return okResult();
  }
}
