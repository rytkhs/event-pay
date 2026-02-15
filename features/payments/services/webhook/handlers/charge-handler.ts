import Stripe from "stripe";

import { okResult } from "@core/errors";
import { getMetadata, getPaymentIntentId } from "@core/stripe/guards";
import type { PaymentWebhookMetaJson } from "@core/types/payment";
import type { PaymentStatus } from "@core/types/statuses";
import { handleServerError } from "@core/utils/error-handler.server";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

import type { WebhookContextLogger } from "../context/webhook-handler-context";
import { createWebhookDbError } from "../errors/webhook-error-factory";
import { PaymentWebhookRepository } from "../repositories/payment-webhook-repository";
import { PaymentNotificationService } from "../services/payment-notification-service";
import {
  STRIPE_OBJECT_FETCH_POLICY,
  StripeObjectFetchService,
} from "../services/stripe-object-fetch-service";
import type { WebhookProcessingResult } from "../types";

interface ChargeHandlerParams {
  paymentRepository: PaymentWebhookRepository;
  stripeObjectFetchService: StripeObjectFetchService;
  paymentNotificationService: PaymentNotificationService;
  logger: WebhookContextLogger;
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

function toStripeFeeDetailsJson(
  feeDetails: Stripe.BalanceTransaction.FeeDetail[] | null
): PaymentWebhookMetaJson | null {
  if (!feeDetails) {
    return null;
  }

  return feeDetails.map((detail) => ({
    amount: detail.amount,
    currency: detail.currency,
    type: detail.type,
  }));
}

export class ChargeHandler {
  private readonly paymentRepository: PaymentWebhookRepository;
  private readonly stripeObjectFetchService: StripeObjectFetchService;
  private readonly paymentNotificationService: PaymentNotificationService;
  private readonly logger: WebhookContextLogger;

  constructor(params: ChargeHandlerParams) {
    this.paymentRepository = params.paymentRepository;
    this.stripeObjectFetchService = params.stripeObjectFetchService;
    this.paymentNotificationService = params.paymentNotificationService;
    this.logger = params.logger;
  }

  async handleSucceeded(event: Stripe.ChargeSucceededEvent): Promise<WebhookProcessingResult> {
    const charge = event.data.object;

    try {
      this.logger.debug("Stripe object fetch policy applied", {
        event_id: event.id,
        trust_webhook_payload: STRIPE_OBJECT_FETCH_POLICY.trustWebhookPayload.join(","),
        always_retrieve_from_stripe: STRIPE_OBJECT_FETCH_POLICY.alwaysRetrieveFromStripe.join(","),
      });

      const stripePaymentIntentId = getPaymentIntentId(charge);
      const { charge: fetchedCharge, source: chargeSnapshotSource } =
        await this.stripeObjectFetchService.getChargeSnapshotForChargeSucceeded({
          charge,
          stripePaymentIntentId,
        });
      this.logger.debug("Charge snapshot resolved for charge.succeeded", {
        event_id: event.id,
        event_charge_id: charge.id,
        snapshot_charge_id: fetchedCharge.id,
        charge_snapshot_source: chargeSnapshotSource,
      });

      const payment = await this.paymentRepository.resolveByChargeOrFallback({
        paymentIntentId: stripePaymentIntentId,
        chargeId: charge.id,
        metadataPaymentId: getPaymentIdFromMetadata(charge),
      });

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleChargeSucceeded",
          additionalData: {
            eventId: event.id,
            chargeId: charge.id,
            payment_intent: stripePaymentIntentId ?? undefined,
          },
        });
        return okResult();
      }

      if (!canPromoteStatus(payment.status as PaymentStatus, "paid")) {
        this.logger.info("Duplicate webhook event preventing double processing", {
          event_id: event.id,
          payment_id: payment.id,
          current_status: payment.status,
          outcome: "success",
        });
        return okResult();
      }

      const chargeObj = fetchedCharge;
      const btObj = ((): {
        id: string | null;
        fee: number | null;
        net: number | null;
        fee_details: Stripe.BalanceTransaction.FeeDetail[] | null;
      } => {
        const raw = chargeObj.balance_transaction;
        if (raw && typeof raw === "object") {
          return {
            id: raw.id,
            fee: typeof raw.fee === "number" ? raw.fee : null,
            net: typeof raw.net === "number" ? raw.net : null,
            fee_details: Array.isArray(raw.fee_details) ? raw.fee_details : null,
          };
        }
        if (typeof raw === "string") {
          return { id: raw, fee: null, net: null, fee_details: null };
        }
        return { id: null, fee: null, net: null, fee_details: null };
      })();
      const balanceTxnId: string | null = btObj.id;
      const transferId = getExpandableId(chargeObj.transfer);
      const applicationFeeId = getExpandableId(chargeObj.application_fee);

      const { error: updateError } =
        await this.paymentRepository.updateStatusPaidFromChargeSnapshot({
          paymentId: payment.id,
          eventId: event.id,
          chargeId: charge.id,
          paymentIntentId: stripePaymentIntentId,
          balanceTransactionId: balanceTxnId,
          fee: btObj.fee,
          net: btObj.net,
          feeDetails: toStripeFeeDetailsJson(btObj.fee_details),
          transferId,
          applicationFeeId,
        });

      if (updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleChargeSucceeded",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            chargeId: charge.id,
            error_message: updateError.message,
            error_code: updateError.code,
          },
        });
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "charge_succeeded_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "決済ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            chargeId: charge.id,
          },
        });
      }

      const { logPayment } = await import("@core/logging/system-logger");
      await logPayment({
        action: "payment.status_update",
        message: `Payment status updated to paid via webhook`,
        resource_id: payment.id,
        outcome: "success",
        stripe_request_id: event.request?.id ?? undefined,
        dedupe_key: `webhook:payment_update:${event.id}`,
        metadata: {
          old_status: payment.status,
          new_status: "paid",
          amount: payment.amount,
          charge_id: charge.id,
          balance_transaction_id: balanceTxnId,
          stripe_event_id: event.id,
        },
      });

      this.logger.info("Charge succeeded processed", {
        event_id: event.id,
        payment_id: payment.id,
        charge_id: charge.id,
        balance_transaction_id: balanceTxnId,
        transfer_id: transferId ?? undefined,
        outcome: "success",
      });

      await this.paymentNotificationService.sendPaymentCompletedNotification({
        paymentId: payment.id,
        attendanceId: payment.attendance_id,
        amount: payment.amount,
        receiptUrl: charge.receipt_url ?? null,
      });

      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  async handleFailed(event: Stripe.ChargeFailedEvent): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    const stripePaymentIntentId = getPaymentIntentId(charge);

    try {
      const payment = await this.paymentRepository.resolveByChargeOrFallback({
        paymentIntentId: stripePaymentIntentId,
        chargeId: charge.id,
        metadataPaymentId: getPaymentIdFromMetadata(charge),
      });
      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleChargeFailed",
          additionalData: {
            eventId: event.id,
            chargeId: charge.id,
          },
        });
        return okResult();
      }

      if (!canPromoteStatus(payment.status as PaymentStatus, "failed")) {
        this.logger.info("Duplicate webhook event preventing double processing", {
          event_id: event.id,
          payment_id: payment.id,
          current_status: payment.status,
          outcome: "success",
        });
        return okResult();
      }

      const { error: updateError } = await this.paymentRepository.updateStatusFailedFromCharge({
        paymentId: payment.id,
        eventId: event.id,
        chargeId: charge.id,
        paymentIntentId: stripePaymentIntentId,
      });
      if (updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleChargeFailed",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            chargeId: charge.id,
            error_message: updateError.message,
            error_code: updateError.code,
          },
        });
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "charge_failed_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "決済ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            chargeId: charge.id,
          },
        });
      }

      this.logger.info("Charge failed processed", {
        event_id: event.id,
        payment_id: payment.id,
        charge_id: charge.id,
        outcome: "success",
      });
      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }
}
