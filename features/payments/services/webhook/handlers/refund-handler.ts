import Stripe from "stripe";

import { okResult } from "@core/errors";
import { getMetadata, getPaymentIntentId } from "@core/stripe/guards";
import type { PaymentStatus } from "@core/types/statuses";
import { handleServerError } from "@core/utils/error-handler.server";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

import type { WebhookContextLogger } from "../context/webhook-handler-context";
import { createWebhookDbError } from "../errors/webhook-error-factory";
import type { PaymentWebhookRecord } from "../repositories/payment-webhook-repository";
import { PaymentWebhookRepository } from "../repositories/payment-webhook-repository";
import { StripeObjectFetchService } from "../services/stripe-object-fetch-service";
import type { WebhookProcessingResult } from "../types";
import { getRefundFromWebhookEvent } from "../webhook-event-guards";

interface RefundHandlerParams {
  paymentRepository: PaymentWebhookRepository;
  stripeObjectFetchService: StripeObjectFetchService;
  logger: WebhookContextLogger;
  regenerateSettlementSnapshotFromPayment: (payment: unknown) => Promise<void>;
}

interface ApplyRefundAggregateParams {
  charge: Stripe.Charge;
  eventId: string;
  allowDemotion: boolean;
  enforcePromotion: boolean;
}

interface ApplyRefundAggregateResult {
  payment: PaymentWebhookRecord | null;
  targetStatus: PaymentStatus | null;
  totalRefunded: number;
  applicationFeeRefundedAmount: number;
  skippedByPromotionRule: boolean;
  updateError: { message: string; code?: string | null } | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

function getPaymentIdFromMetadata(source: unknown): string | null {
  const metadata = getMetadata(source);
  const paymentId = metadata?.["payment_id"];
  return isNonEmptyString(paymentId) ? paymentId : null;
}

export class RefundHandler {
  private readonly paymentRepository: PaymentWebhookRepository;
  private readonly stripeObjectFetchService: StripeObjectFetchService;
  private readonly logger: WebhookContextLogger;
  private readonly regenerateSettlementSnapshotFromPayment: (payment: unknown) => Promise<void>;

  constructor(params: RefundHandlerParams) {
    this.paymentRepository = params.paymentRepository;
    this.stripeObjectFetchService = params.stripeObjectFetchService;
    this.logger = params.logger;
    this.regenerateSettlementSnapshotFromPayment = params.regenerateSettlementSnapshotFromPayment;
  }

  async handleCreated(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const refund = getRefundFromWebhookEvent(event);
    if (!refund) {
      handleServerError("WEBHOOK_INVALID_PAYLOAD", {
        action: "handleRefundCreated",
        additionalData: { eventId: event.id, detail: "Invalid refund object" },
      });
      return okResult();
    }

    this.logger.info("Refund created event received", {
      event_id: event.id,
      refund_id: refund.id,
      status: refund.status,
      outcome: "success",
    });
    return okResult();
  }

  async handleUpdated(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const refund = getRefundFromWebhookEvent(event);
    if (!refund) {
      handleServerError("WEBHOOK_INVALID_PAYLOAD", {
        action: "handleRefundUpdated",
        additionalData: { eventId: event.id, detail: "Invalid refund object" },
      });
      return okResult();
    }

    const status = refund.status;
    this.logger.info("Refund updated event received", {
      event_id: event.id,
      refund_id: refund.id,
      status,
      outcome: "success",
    });

    if (status === "canceled" || status === "failed") {
      const chargeId = getExpandableId(refund.charge);
      if (chargeId) {
        await this.syncRefundAggregateByChargeId(chargeId, event.id, true);
      }
    }

    return okResult();
  }

  async handleFailed(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const refund = getRefundFromWebhookEvent(event);
    if (!refund) {
      handleServerError("WEBHOOK_INVALID_PAYLOAD", {
        action: "handleRefundFailed",
        additionalData: { eventId: event.id, detail: "Invalid refund object" },
      });
      return okResult();
    }

    const chargeId = getExpandableId(refund.charge);
    this.logger.warn("Refund failed event received", {
      event_id: event.id,
      refund_id: refund.id,
      charge_id: chargeId,
      outcome: "success",
    });

    if (chargeId) {
      await this.syncRefundAggregateByChargeId(chargeId, event.id, true);
    }

    return okResult();
  }

  async handleChargeRefunded(event: Stripe.ChargeRefundedEvent): Promise<WebhookProcessingResult> {
    const charge = event.data.object;

    try {
      const applied = await this.applyRefundAggregateFromCharge({
        charge,
        eventId: event.id,
        allowDemotion: false,
        enforcePromotion: true,
      });

      if (!applied.payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleChargeRefunded",
          additionalData: {
            eventId: event.id,
            chargeId: charge.id,
          },
        });
        return okResult();
      }

      if (applied.skippedByPromotionRule || !applied.targetStatus) {
        return okResult();
      }

      if (applied.updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleChargeRefunded",
          additionalData: {
            eventId: event.id,
            paymentId: applied.payment.id,
            chargeId: charge.id,
            error_message: applied.updateError.message,
            error_code: applied.updateError.code,
          },
        });
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "charge_refunded_update_failed",
          eventId: event.id,
          paymentId: applied.payment.id,
          userMessage: "返金ステータス更新に失敗しました",
          dbError: applied.updateError,
          details: {
            eventId: event.id,
            paymentId: applied.payment.id,
            chargeId: charge.id,
          },
        });
      }

      this.logger.info("Refund processed successfully", {
        event_id: event.id,
        payment_id: applied.payment.id,
        refunded_amount: applied.totalRefunded,
        application_fee_refunded_amount: applied.applicationFeeRefundedAmount,
        target_status: applied.targetStatus,
        outcome: "success",
      });

      try {
        await this.regenerateSettlementSnapshotFromPayment(applied.payment);
      } catch (e) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "handleChargeRefunded",
          additionalData: {
            eventId: event.id,
            paymentId: applied.payment.id,
            error: e instanceof Error ? e.message : "unknown",
          },
        });
      }

      return okResult(undefined, { eventId: event.id, paymentId: applied.payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async syncRefundAggregateByChargeId(
    chargeId: string,
    eventId: string,
    allowDemotion: boolean
  ): Promise<void> {
    const charge = await this.stripeObjectFetchService.retrieveChargeForRefundAggregation(chargeId);
    const applied = await this.applyRefundAggregateFromCharge({
      charge,
      eventId,
      allowDemotion,
      enforcePromotion: false,
    });

    if (applied.updateError) {
      throw new Error(`Failed to resync payment on refund change: ${applied.updateError.message}`);
    }

    if (!applied.payment) {
      handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
        action: "applyRefundAggregateFromCharge",
        additionalData: { eventId, chargeId: charge.id },
      });
      return;
    }

    if (applied.payment && applied.targetStatus) {
      this.logger.info("Payment resynced from charge (refund)", {
        event_id: eventId,
        payment_id: applied.payment.id,
        total_refunded: applied.totalRefunded,
        target_status: applied.targetStatus,
        resync: true,
        outcome: "success",
      });
    }
  }

  private async applyRefundAggregateFromCharge(
    params: ApplyRefundAggregateParams
  ): Promise<ApplyRefundAggregateResult> {
    const { charge, eventId, allowDemotion, enforcePromotion } = params;

    const stripePaymentIntentId = getPaymentIntentId(charge);
    const payment = await this.paymentRepository.resolveByChargeOrFallback({
      paymentIntentId: stripePaymentIntentId,
      chargeId: charge.id,
      metadataPaymentId: getPaymentIdFromMetadata(charge),
    });

    if (!payment) {
      return {
        payment: null,
        targetStatus: null,
        totalRefunded: 0,
        applicationFeeRefundedAmount: 0,
        skippedByPromotionRule: false,
        updateError: null,
      };
    }

    const totalRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;

    let applicationFeeRefundedAmount = payment.application_fee_refunded_amount;
    let applicationFeeRefundId: string | null = payment.application_fee_refund_id;

    if (payment.application_fee_id) {
      try {
        const summed = await this.stripeObjectFetchService.sumApplicationFeeRefunds(
          payment.application_fee_id
        );
        applicationFeeRefundedAmount = summed.amount;
        applicationFeeRefundId = summed.latestRefundId;
      } catch {
        // Stripe API取得失敗時は既存DB値を保持して過剰上書きを避ける
      }
    } else {
      applicationFeeRefundedAmount = 0;
      applicationFeeRefundId = null;
    }

    let targetStatus = payment.status as PaymentStatus;
    if (totalRefunded >= payment.amount) {
      targetStatus = "refunded";
    } else if (allowDemotion && targetStatus === "refunded") {
      targetStatus = "paid";
    }

    if (enforcePromotion && !canPromoteStatus(payment.status as PaymentStatus, targetStatus)) {
      this.logger.info("Duplicate webhook event preventing double processing", {
        event_id: eventId,
        payment_id: payment.id,
        current_status: payment.status,
        target_status: targetStatus,
        outcome: "success",
      });
      return {
        payment,
        targetStatus,
        totalRefunded,
        applicationFeeRefundedAmount,
        skippedByPromotionRule: true,
        updateError: null,
      };
    }

    const { error: updateError } = await this.paymentRepository.updateRefundAggregate({
      paymentId: payment.id,
      eventId,
      chargeId: charge.id,
      paymentIntentId: stripePaymentIntentId,
      status: targetStatus,
      refundedAmount: totalRefunded,
      applicationFeeRefundedAmount,
      applicationFeeRefundId,
    });

    return {
      payment,
      targetStatus,
      totalRefunded,
      applicationFeeRefundedAmount,
      skippedByPromotionRule: false,
      updateError: updateError
        ? {
            message: updateError.message,
            code: updateError.code,
          }
        : null,
    };
  }
}
