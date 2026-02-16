import Stripe from "stripe";

import { okResult } from "@core/errors";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookContextLogger } from "../context/webhook-handler-context";
import { DisputeWebhookRepository } from "../repositories/dispute-webhook-repository";
import {
  isPaymentWebhookRepositoryError,
  PaymentWebhookRepository,
} from "../repositories/payment-webhook-repository";
import { SettlementRegenerationService } from "../services/settlement-regeneration-service";
import type { WebhookProcessingResult } from "../types";

interface DisputeHandlerParams {
  paymentRepository: PaymentWebhookRepository;
  disputeRepository: DisputeWebhookRepository;
  settlementRegenerationService: SettlementRegenerationService;
  logger: WebhookContextLogger;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getExpandableId(value: string | { id: string } | null | undefined): string | null {
  if (isNonEmptyString(value)) {
    return value;
  }

  if (value && typeof value === "object" && isNonEmptyString(value.id)) {
    return value.id;
  }

  return null;
}

function getDisputeFromWebhookEvent(event: Stripe.Event): Stripe.Dispute | null {
  if (!isRecord(event.data) || !isRecord(event.data.object)) {
    return null;
  }

  const object = event.data.object;
  if (object.object !== "dispute" || !isNonEmptyString(object.id)) {
    return null;
  }

  return object as Stripe.Dispute;
}

export class DisputeHandler {
  private readonly paymentRepository: PaymentWebhookRepository;
  private readonly disputeRepository: DisputeWebhookRepository;
  private readonly settlementRegenerationService: SettlementRegenerationService;
  private readonly logger: WebhookContextLogger;

  constructor(params: DisputeHandlerParams) {
    this.paymentRepository = params.paymentRepository;
    this.disputeRepository = params.disputeRepository;
    this.settlementRegenerationService = params.settlementRegenerationService;
    this.logger = params.logger;
  }

  async handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const dispute = getDisputeFromWebhookEvent(event);
    if (!dispute) {
      handleServerError("WEBHOOK_INVALID_PAYLOAD", {
        action: "handleDisputeEvent",
        additionalData: { eventId: event.id, detail: "Invalid dispute object" },
      });
      return okResult();
    }

    this.logger.info("Dispute event received", {
      event_id: event.id,
      dispute_id: dispute.id,
      status: dispute.status,
      type: event.type,
      outcome: "success",
    });

    try {
      const chargeId = getExpandableId(
        dispute.charge as string | { id: string } | null | undefined
      );
      const paymentIntentId = getExpandableId(
        dispute.payment_intent as string | { id: string } | null | undefined
      );

      const payment = await this.paymentRepository.resolveForDispute({
        paymentIntentId,
        chargeId,
      });

      const upsertResult = await this.disputeRepository.upsertDisputeRecord({
        dispute,
        paymentId: payment?.id ?? null,
        chargeId,
        paymentIntentId,
        eventType: event.type,
        stripeAccountId: event.account,
      });

      if (upsertResult.error) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleDisputeEvent",
          additionalData: {
            eventId: event.id,
            disputeId: dispute.id,
            error_message: upsertResult.error.message,
            error_code: upsertResult.error.code,
          },
        });
      }

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleDisputeEvent",
          additionalData: { eventId: event.id, chargeId, paymentIntentId },
        });
        return okResult();
      }

      await this.settlementRegenerationService.regenerateSettlementSnapshotFromPayment(payment, {
        action: "handleDisputeEvent",
        eventId: event.id,
        paymentId: payment.id,
      });

      return okResult();
    } catch (error) {
      if (isPaymentWebhookRepositoryError(error) && !error.terminal) {
        throw error;
      }

      handleServerError("SETTLEMENT_REGENERATE_FAILED", {
        action: "handleDisputeEvent",
        additionalData: {
          eventId: event.id,
          error: error instanceof Error ? error.message : "unknown",
        },
      });
      return okResult();
    }
  }
}
