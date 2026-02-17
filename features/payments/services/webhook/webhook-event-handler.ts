import Stripe from "stripe";

import { okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookHandlerContext } from "./context/webhook-handler-context";
import {
  createWebhookHandlerRuntime,
  type WebhookHandlerRuntime,
} from "./context/webhook-handler-runtime";
import { createWebhookDbError, createWebhookUnexpectedError } from "./errors/webhook-error-factory";
import { isWebhookLedgerFailureDetails } from "./errors/webhook-ledger-error-guard";
import {
  isPaymentWebhookRepositoryError,
  type PaymentWebhookRepositoryError,
} from "./repositories/payment-webhook-repository";
import { type WebhookEventLedgerRepository } from "./repositories/webhook-event-ledger-repository";
import { routeStripePaymentEvent } from "./router/stripe-event-router";
import type { WebhookProcessingResult } from "./types";

export interface WebhookEventHandler {
  handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult>;
}

const DEDUPE_POLICY = "primary:event.id secondary:event.type+object.id";
const WEBHOOK_UNEXPECTED_ERROR_CODE = "WEBHOOK_UNEXPECTED_ERROR";

export class StripeWebhookEventHandler implements WebhookEventHandler {
  private supabase: AppSupabaseClient | null = null;
  private runtime: WebhookHandlerRuntime | null = null;

  private readonly webhookLogger = logger.withContext({
    category: "stripe_webhook",
    action: "webhook_event_handler",
    actor_type: "webhook",
  });

  private async ensureInitialized(): Promise<void> {
    if (this.supabase) {
      return;
    }

    const factory = getSecureClientFactory();
    this.supabase = (await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "Stripe Webhook Event Handling"
    )) as AppSupabaseClient;
  }

  private getContext(): WebhookHandlerContext {
    if (!this.supabase) {
      throw new Error("StripeWebhookEventHandler is not initialized");
    }

    return {
      supabase: this.supabase,
      logger: this.webhookLogger,
    };
  }

  private getRuntime(context: WebhookHandlerContext): WebhookHandlerRuntime {
    if (!this.runtime) {
      this.runtime = createWebhookHandlerRuntime(context);
    }
    return this.runtime;
  }

  private async markLedgerFailedSafely(
    eventLedgerRepository: WebhookEventLedgerRepository,
    event: Stripe.Event,
    params: { errorCode: string; reason: string; terminal: boolean }
  ): Promise<void> {
    try {
      await eventLedgerRepository.markFailed(event.id, params);
    } catch (markFailedError) {
      handleServerError(WEBHOOK_UNEXPECTED_ERROR_CODE, {
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
  }

  private createPaymentRepositoryFailureResult(
    error: PaymentWebhookRepositoryError,
    event: Stripe.Event,
    reason: string
  ): WebhookProcessingResult {
    return createWebhookDbError({
      code: WEBHOOK_UNEXPECTED_ERROR_CODE,
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

  async handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    await this.ensureInitialized();
    const context = this.getContext();
    const runtime = this.getRuntime(context);
    const { eventLedgerRepository } = runtime;

    try {
      const ledgerResult = await eventLedgerRepository.beginProcessing(event);
      if (
        ledgerResult.action === "ack_duplicate_succeeded" ||
        ledgerResult.action === "ack_duplicate_failed_terminal"
      ) {
        this.webhookLogger.info("Duplicate webhook event acknowledged via ledger", {
          event_id: event.id,
          event_type: event.type,
          stripe_object_id: ledgerResult.stripeObjectId ?? undefined,
          dedupe_key: ledgerResult.dedupeKey,
          dedupe_policy: DEDUPE_POLICY,
          ledger_action: ledgerResult.action,
          ledger_status: ledgerResult.status,
          last_error_code: ledgerResult.lastErrorCode ?? undefined,
          last_error_reason: ledgerResult.lastErrorReason ?? undefined,
          outcome: "success",
        });
        return okResult();
      }

      if (ledgerResult.action === "ack_duplicate_in_progress") {
        this.webhookLogger.info("Webhook event already in processing state (ack)", {
          event_id: event.id,
          event_type: event.type,
          stripe_object_id: ledgerResult.stripeObjectId ?? undefined,
          dedupe_key: ledgerResult.dedupeKey,
          dedupe_policy: DEDUPE_POLICY,
          ledger_action: ledgerResult.action,
          ledger_status: ledgerResult.status,
          outcome: "success",
        });
        return okResult();
      }

      const processingResult = await routeStripePaymentEvent({
        event,
        context,
        handlers: runtime.routerHandlers,
      });

      if (processingResult.success) {
        try {
          await eventLedgerRepository.markSucceeded(event.id);
          return processingResult;
        } catch (markSucceededError) {
          handleServerError(WEBHOOK_UNEXPECTED_ERROR_CODE, {
            action: "handleEvent.markSucceeded",
            additionalData: {
              eventType: event.type,
              eventId: event.id,
              error:
                markSucceededError instanceof Error
                  ? markSucceededError.message
                  : "Unknown mark succeeded error",
            },
          });

          await this.markLedgerFailedSafely(eventLedgerRepository, event, {
            errorCode: WEBHOOK_UNEXPECTED_ERROR_CODE,
            reason: "mark_succeeded_failed",
            terminal: false,
          });

          return createWebhookUnexpectedError({
            error: markSucceededError,
            eventId: event.id,
            eventType: event.type,
            reason: "mark_succeeded_failed",
          });
        }
      }

      await this.markLedgerFailedSafely(eventLedgerRepository, event, {
        errorCode: processingResult.meta?.errorCode ?? processingResult.error.code,
        reason: processingResult.meta?.reason ?? "unknown",
        terminal: processingResult.meta?.terminal ?? !processingResult.error.retryable,
      });

      return processingResult;
    } catch (error) {
      handleServerError(WEBHOOK_UNEXPECTED_ERROR_CODE, {
        action: "handleEvent",
        additionalData: {
          eventType: event.type,
          eventId: event.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      if (isPaymentWebhookRepositoryError(error)) {
        const reason = `payment_repository_${error.operation}_${error.category}_failed`;

        await this.markLedgerFailedSafely(eventLedgerRepository, event, {
          errorCode: error.code ?? WEBHOOK_UNEXPECTED_ERROR_CODE,
          reason,
          terminal: error.terminal,
        });

        return this.createPaymentRepositoryFailureResult(error, event, reason);
      }

      if (isWebhookLedgerFailureDetails(error)) {
        return createWebhookDbError({
          code: WEBHOOK_UNEXPECTED_ERROR_CODE,
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

      await this.markLedgerFailedSafely(eventLedgerRepository, event, {
        errorCode: WEBHOOK_UNEXPECTED_ERROR_CODE,
        reason: "unexpected_error",
        terminal: false,
      });

      return createWebhookUnexpectedError({
        error,
        eventId: event.id,
        eventType: event.type,
        reason: "unexpected_error",
      });
    }
  }
}
