import Stripe from "stripe";

import { okResult } from "@core/errors";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookContextLogger } from "../context/webhook-handler-context";
import { createWebhookDbError } from "../errors/webhook-error-factory";
import { PaymentWebhookRepository } from "../repositories/payment-webhook-repository";
import { SettlementRegenerationService } from "../services/settlement-regeneration-service";
import { StripeObjectFetchService } from "../services/stripe-object-fetch-service";
import type { WebhookProcessingResult } from "../types";

interface ApplicationFeeHandlerParams {
  paymentRepository: PaymentWebhookRepository;
  stripeObjectFetchService: StripeObjectFetchService;
  logger: WebhookContextLogger;
  settlementRegenerationService: SettlementRegenerationService;
}

function extractApplicationFeeId(event: Stripe.Event): string | null {
  const obj = event.data?.object as
    | Stripe.ApplicationFee
    | (Stripe.FeeRefund & { fee: string | Stripe.ApplicationFee })
    | undefined;

  if (!obj) {
    return null;
  }

  if (obj.object === "application_fee" && typeof obj.id === "string") {
    return obj.id;
  }

  if (obj.object === "fee_refund") {
    const feeField = (obj as Stripe.FeeRefund & { fee: string | Stripe.ApplicationFee }).fee;
    if (typeof feeField === "string") {
      return feeField;
    }

    if (feeField && typeof feeField.id === "string") {
      return feeField.id;
    }
  }

  return null;
}

export class ApplicationFeeHandler {
  private readonly paymentRepository: PaymentWebhookRepository;
  private readonly stripeObjectFetchService: StripeObjectFetchService;
  private readonly logger: WebhookContextLogger;
  private readonly settlementRegenerationService: SettlementRegenerationService;

  constructor(params: ApplicationFeeHandlerParams) {
    this.paymentRepository = params.paymentRepository;
    this.stripeObjectFetchService = params.stripeObjectFetchService;
    this.logger = params.logger;
    this.settlementRegenerationService = params.settlementRegenerationService;
  }

  async handleRefunded(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const applicationFeeId = extractApplicationFeeId(event);

    if (!applicationFeeId) {
      handleServerError("WEBHOOK_INVALID_PAYLOAD", {
        action: "handleApplicationFeeRefunded",
        additionalData: { eventId: event.id, detail: "No application fee ID found" },
      });
      return okResult();
    }

    const payment = await this.paymentRepository.findByApplicationFeeId(applicationFeeId);
    if (!payment) {
      handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
        action: "handleApplicationFeeRefunded",
        additionalData: { eventId: event.id, applicationFeeId },
      });
      return okResult();
    }

    let applicationFeeRefundedAmount = payment.application_fee_refunded_amount;
    let applicationFeeRefundId: string | null = payment.application_fee_refund_id;

    try {
      const summed = await this.stripeObjectFetchService.sumApplicationFeeRefunds(applicationFeeId);
      applicationFeeRefundedAmount = summed.amount;
      applicationFeeRefundId = summed.latestRefundId;
    } catch (e) {
      handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
        action: "handleApplicationFeeRefunded",
        additionalData: {
          eventId: event.id,
          applicationFeeId,
          error: e instanceof Error ? e.message : "unknown",
        },
      });
    }

    const { error: updateError } = await this.paymentRepository.updateApplicationFeeRefundAggregate(
      {
        paymentId: payment.id,
        eventId: event.id,
        applicationFeeRefundedAmount,
        applicationFeeRefundId,
      }
    );

    if (updateError) {
      handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
        action: "handleApplicationFeeRefunded",
        additionalData: {
          eventId: event.id,
          paymentId: payment.id,
          applicationFeeId,
          error_message: updateError.message,
          error_code: updateError.code,
        },
      });

      return createWebhookDbError({
        code: "WEBHOOK_UNEXPECTED_ERROR",
        reason: "application_fee_refund_update_failed",
        eventId: event.id,
        paymentId: payment.id,
        userMessage: "手数料返金の反映に失敗しました",
        dbError: updateError,
        details: {
          eventId: event.id,
          paymentId: payment.id,
          applicationFeeId,
        },
      });
    }

    this.logger.info("Application fee refund processed", {
      event_id: event.id,
      payment_id: payment.id,
      application_fee_id: applicationFeeId,
      application_fee_refunded_amount: applicationFeeRefundedAmount,
      outcome: "success",
    });

    await this.settlementRegenerationService.regenerateSettlementSnapshotFromPayment(payment, {
      action: "handleApplicationFeeRefunded",
      eventId: event.id,
      paymentId: payment.id,
    });

    return okResult(undefined, { eventId: event.id, paymentId: payment.id });
  }
}
