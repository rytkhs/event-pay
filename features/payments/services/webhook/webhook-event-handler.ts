import Stripe from "stripe";

import { okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookHandlerContext } from "./context/webhook-handler-context";
import { createWebhookDbError, createWebhookUnexpectedError } from "./errors/webhook-error-factory";
import { ApplicationFeeHandler } from "./handlers/application-fee-handler";
import { ChargeHandler } from "./handlers/charge-handler";
import { CheckoutSessionHandler } from "./handlers/checkout-session-handler";
import { DisputeHandler } from "./handlers/dispute-handler";
import { PaymentIntentHandler } from "./handlers/payment-intent-handler";
import { RefundHandler } from "./handlers/refund-handler";
import { DisputeWebhookRepository } from "./repositories/dispute-webhook-repository";
import {
  PaymentWebhookRepository,
  isPaymentWebhookRepositoryError,
} from "./repositories/payment-webhook-repository";
import {
  WebhookEventLedgerRepository,
  type WebhookLedgerFailureDetails,
} from "./repositories/webhook-event-ledger-repository";
import { routeStripePaymentEvent } from "./router/stripe-event-router";
import { PaymentAnalyticsWebhookService } from "./services/payment-analytics-service";
import { PaymentNotificationService } from "./services/payment-notification-service";
import { SettlementRegenerationService } from "./services/settlement-regeneration-service";
import { StripeObjectFetchService } from "./services/stripe-object-fetch-service";
import type { WebhookProcessingResult } from "./types";

export interface WebhookEventHandler {
  handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWebhookLedgerFailureDetails(value: unknown): value is WebhookLedgerFailureDetails {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.message) &&
    (value.operation === "begin" ||
      value.operation === "mark_succeeded" ||
      value.operation === "mark_failed")
  );
}

export class StripeWebhookEventHandler implements WebhookEventHandler {
  private supabase!: AppSupabaseClient;
  private paymentRepository?: PaymentWebhookRepository;
  private stripeObjectFetchService?: StripeObjectFetchService;
  private paymentAnalyticsService?: PaymentAnalyticsWebhookService;
  private paymentNotificationServiceInstance?: PaymentNotificationService;
  private checkoutSessionHandlerInstance?: CheckoutSessionHandler;
  private paymentIntentHandlerInstance?: PaymentIntentHandler;
  private chargeHandlerInstance?: ChargeHandler;
  private refundHandlerInstance?: RefundHandler;
  private applicationFeeHandlerInstance?: ApplicationFeeHandler;
  private settlementRegenerationServiceInstance?: SettlementRegenerationService;
  private disputeWebhookRepositoryInstance?: DisputeWebhookRepository;
  private disputeHandlerInstance?: DisputeHandler;

  constructor() {}

  /**
   * Supabaseクライアントの初期化を確実に行う
   */
  private async ensureInitialized() {
    if (this.supabase) return;
    const factory = getSecureClientFactory();
    this.supabase = (await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "Stripe Webhook Event Handling"
    )) as AppSupabaseClient;
  }

  /**
   * 構造化ロガー
   */
  private get logger() {
    return logger.withContext({
      category: "stripe_webhook",
      action: "webhook_event_handler",
      actor_type: "webhook",
    });
  }

  private buildContext(): WebhookHandlerContext {
    return {
      supabase: this.supabase,
      logger: this.logger,
    };
  }

  private get paymentWebhookRepository(): PaymentWebhookRepository {
    if (!this.paymentRepository) {
      this.paymentRepository = new PaymentWebhookRepository(this.supabase);
    }
    return this.paymentRepository;
  }

  private get stripeFetchService(): StripeObjectFetchService {
    if (!this.stripeObjectFetchService) {
      this.stripeObjectFetchService = new StripeObjectFetchService();
    }
    return this.stripeObjectFetchService;
  }

  private get analyticsWebhookService(): PaymentAnalyticsWebhookService {
    if (!this.paymentAnalyticsService) {
      this.paymentAnalyticsService = new PaymentAnalyticsWebhookService({
        supabase: this.supabase,
        logger: this.logger,
      });
    }
    return this.paymentAnalyticsService;
  }

  private get checkoutSessionHandler(): CheckoutSessionHandler {
    if (!this.checkoutSessionHandlerInstance) {
      this.checkoutSessionHandlerInstance = new CheckoutSessionHandler({
        paymentRepository: this.paymentWebhookRepository,
        paymentAnalyticsService: this.analyticsWebhookService,
        logger: this.logger,
      });
    }
    return this.checkoutSessionHandlerInstance;
  }

  private get paymentNotificationService(): PaymentNotificationService {
    if (!this.paymentNotificationServiceInstance) {
      this.paymentNotificationServiceInstance = new PaymentNotificationService({
        supabase: this.supabase,
        logger: this.logger,
      });
    }
    return this.paymentNotificationServiceInstance;
  }

  private get paymentIntentHandler(): PaymentIntentHandler {
    if (!this.paymentIntentHandlerInstance) {
      this.paymentIntentHandlerInstance = new PaymentIntentHandler({
        paymentRepository: this.paymentWebhookRepository,
        supabase: this.supabase,
        logger: this.logger,
      });
    }
    return this.paymentIntentHandlerInstance;
  }

  private get chargeHandler(): ChargeHandler {
    if (!this.chargeHandlerInstance) {
      this.chargeHandlerInstance = new ChargeHandler({
        paymentRepository: this.paymentWebhookRepository,
        stripeObjectFetchService: this.stripeFetchService,
        paymentNotificationService: this.paymentNotificationService,
        logger: this.logger,
      });
    }
    return this.chargeHandlerInstance;
  }

  private get settlementRegenerationService(): SettlementRegenerationService {
    if (!this.settlementRegenerationServiceInstance) {
      this.settlementRegenerationServiceInstance = new SettlementRegenerationService({
        supabase: this.supabase,
        logger: this.logger,
      });
    }
    return this.settlementRegenerationServiceInstance;
  }

  private get refundHandler(): RefundHandler {
    if (!this.refundHandlerInstance) {
      this.refundHandlerInstance = new RefundHandler({
        paymentRepository: this.paymentWebhookRepository,
        stripeObjectFetchService: this.stripeFetchService,
        logger: this.logger,
        settlementRegenerationService: this.settlementRegenerationService,
      });
    }
    return this.refundHandlerInstance;
  }

  private get applicationFeeHandler(): ApplicationFeeHandler {
    if (!this.applicationFeeHandlerInstance) {
      this.applicationFeeHandlerInstance = new ApplicationFeeHandler({
        paymentRepository: this.paymentWebhookRepository,
        stripeObjectFetchService: this.stripeFetchService,
        logger: this.logger,
        settlementRegenerationService: this.settlementRegenerationService,
      });
    }
    return this.applicationFeeHandlerInstance;
  }

  private get disputeWebhookRepository(): DisputeWebhookRepository {
    if (!this.disputeWebhookRepositoryInstance) {
      this.disputeWebhookRepositoryInstance = new DisputeWebhookRepository(this.supabase);
    }
    return this.disputeWebhookRepositoryInstance;
  }

  private get disputeHandler(): DisputeHandler {
    if (!this.disputeHandlerInstance) {
      this.disputeHandlerInstance = new DisputeHandler({
        paymentRepository: this.paymentWebhookRepository,
        disputeRepository: this.disputeWebhookRepository,
        settlementRegenerationService: this.settlementRegenerationService,
        logger: this.logger,
      });
    }
    return this.disputeHandlerInstance;
  }

  async handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    await this.ensureInitialized();
    const context = this.buildContext();
    const eventLedgerRepository = new WebhookEventLedgerRepository(this.supabase);

    try {
      const ledgerResult = await eventLedgerRepository.beginProcessing(event);
      if (
        ledgerResult.action === "ack_duplicate_succeeded" ||
        ledgerResult.action === "ack_duplicate_failed_terminal"
      ) {
        this.logger.info("Duplicate webhook event acknowledged via ledger", {
          event_id: event.id,
          event_type: event.type,
          stripe_object_id: ledgerResult.stripeObjectId ?? undefined,
          dedupe_key: ledgerResult.dedupeKey,
          dedupe_policy: "primary:event.id secondary:event.type+object.id",
          ledger_action: ledgerResult.action,
          ledger_status: ledgerResult.status,
          last_error_code: ledgerResult.lastErrorCode ?? undefined,
          last_error_reason: ledgerResult.lastErrorReason ?? undefined,
          outcome: "success",
        });
        return okResult();
      }

      if (ledgerResult.action === "ack_duplicate_in_progress") {
        this.logger.warn("Webhook event already in processing state", {
          event_id: event.id,
          event_type: event.type,
          stripe_object_id: ledgerResult.stripeObjectId ?? undefined,
          dedupe_key: ledgerResult.dedupeKey,
          dedupe_policy: "primary:event.id secondary:event.type+object.id",
          ledger_action: ledgerResult.action,
          ledger_status: ledgerResult.status,
          outcome: "failure",
        });
        return createWebhookUnexpectedError({
          eventId: event.id,
          reason: "webhook_event_in_progress",
          eventType: event.type,
          error: new Error("Webhook event is already being processed"),
          userMessage: "Webhookイベントを処理中です。再試行してください",
        });
      }

      if (ledgerResult.stripeObjectId) {
        const duplicateByDedupeKey = await eventLedgerRepository.findLatestByDedupeKey(
          ledgerResult.dedupeKey,
          event.id
        );
        if (duplicateByDedupeKey) {
          this.logger.warn("Potential duplicate webhook payload detected by dedupe key", {
            event_id: event.id,
            event_type: event.type,
            stripe_object_id: ledgerResult.stripeObjectId,
            dedupe_key: ledgerResult.dedupeKey,
            prior_event_id: duplicateByDedupeKey.stripe_event_id,
            prior_status: duplicateByDedupeKey.processing_status,
            dedupe_policy: "primary:event.id secondary:event.type+object.id",
          });
        }
      }

      const processingResult = await routeStripePaymentEvent({
        event,
        context,
        handlers: {
          handleRefundCreated: this.refundHandler.handleCreated.bind(this.refundHandler),
          handleRefundUpdated: this.refundHandler.handleUpdated.bind(this.refundHandler),
          handleRefundFailed: this.refundHandler.handleFailed.bind(this.refundHandler),
          handlePaymentIntentSucceeded: this.paymentIntentHandler.handleSucceeded.bind(
            this.paymentIntentHandler
          ),
          handlePaymentIntentFailed: this.paymentIntentHandler.handleFailed.bind(
            this.paymentIntentHandler
          ),
          handlePaymentIntentCanceled: this.paymentIntentHandler.handleCanceled.bind(
            this.paymentIntentHandler
          ),
          handleChargeSucceeded: this.chargeHandler.handleSucceeded.bind(this.chargeHandler),
          handleChargeFailed: this.chargeHandler.handleFailed.bind(this.chargeHandler),
          handleChargeRefunded: this.refundHandler.handleChargeRefunded.bind(this.refundHandler),
          handleCheckoutSessionCompleted: this.checkoutSessionHandler.handleCompleted.bind(
            this.checkoutSessionHandler
          ),
          handleCheckoutSessionExpired: this.checkoutSessionHandler.handleExpired.bind(
            this.checkoutSessionHandler
          ),
          handleCheckoutSessionAsyncPayment: this.checkoutSessionHandler.handleAsyncPayment.bind(
            this.checkoutSessionHandler
          ),
          handleApplicationFeeRefunded: this.applicationFeeHandler.handleRefunded.bind(
            this.applicationFeeHandler
          ),
          handleDisputeEvent: this.disputeHandler.handleEvent.bind(this.disputeHandler),
        },
      });

      if (processingResult.success) {
        await eventLedgerRepository.markSucceeded(event.id);
        return processingResult;
      }

      await eventLedgerRepository.markFailed(event.id, {
        errorCode: processingResult.meta?.errorCode ?? processingResult.error.code,
        reason: processingResult.meta?.reason,
      });

      return processingResult;
    } catch (error) {
      handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
        action: "handleEvent",
        additionalData: {
          eventType: event.type,
          eventId: event.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      if (isPaymentWebhookRepositoryError(error)) {
        const reason = `payment_repository_${error.operation}_${error.category}_failed`;

        try {
          await eventLedgerRepository.markFailed(event.id, {
            errorCode: error.code ?? "WEBHOOK_UNEXPECTED_ERROR",
            reason,
          });
        } catch (markFailedError) {
          handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
            action: "handleEvent.markFailed",
            additionalData: {
              eventType: event.type,
              eventId: event.id,
              error:
                markFailedError instanceof Error
                  ? markFailedError.message
                  : "Unknown mark failed error",
            },
          });
        }

        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason,
          eventId: event.id,
          userMessage: "決済データの取得に失敗しました",
          dbError: {
            message: error.message,
            code: error.code,
          },
          details: {
            eventId: event.id,
            eventType: event.type,
            operation: error.operation,
            category: error.category,
          },
          terminalOverride: error.terminal,
        });
      }

      if (isWebhookLedgerFailureDetails(error)) {
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: `webhook_ledger_${error.operation}_failed`,
          eventId: event.id,
          userMessage: "Webhook ledger更新に失敗しました",
          dbError: {
            message: error.message,
            code: error.code,
          },
          details: {
            eventId: event.id,
            eventType: event.type,
            operation: error.operation,
            constraint: error.constraint ?? undefined,
            details: error.details ?? undefined,
          },
        });
      }

      try {
        await eventLedgerRepository.markFailed(event.id, {
          errorCode: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "unexpected_error",
        });
      } catch (markFailedError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleEvent.markFailed",
          additionalData: {
            eventType: event.type,
            eventId: event.id,
            error:
              markFailedError instanceof Error
                ? markFailedError.message
                : "Unknown mark failed error",
          },
        });
      }

      return createWebhookUnexpectedError({
        error,
        eventId: event.id,
        eventType: event.type,
        reason: "unexpected_error",
      });
    }
  }
}
