import Stripe from "stripe";

import { okResult } from "@core/errors";
import { getMetadata } from "@core/stripe/guards";
import type { PaymentStatus } from "@core/types/statuses";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

import type { WebhookContextLogger } from "../context/webhook-handler-context";
import {
  createWebhookDbError,
  createWebhookInvalidPayloadError,
} from "../errors/webhook-error-factory";
import { PaymentWebhookRepository } from "../repositories/payment-webhook-repository";
import type { WebhookProcessingResult } from "../types";

interface PaymentIntentHandlerParams {
  paymentRepository: PaymentWebhookRepository;
  supabase: AppSupabaseClient;
  logger: WebhookContextLogger;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getPaymentIdFromMetadata(source: unknown): string | null {
  const metadata = getMetadata(source);
  const paymentId = metadata?.["payment_id"];
  return isNonEmptyString(paymentId) ? paymentId : null;
}

export class PaymentIntentHandler {
  private readonly paymentRepository: PaymentWebhookRepository;
  private readonly supabase: AppSupabaseClient;
  private readonly logger: WebhookContextLogger;

  constructor(params: PaymentIntentHandlerParams) {
    this.paymentRepository = params.paymentRepository;
    this.supabase = params.supabase;
    this.logger = params.logger;
  }

  async handleSucceeded(
    event: Stripe.PaymentIntentSucceededEvent
  ): Promise<WebhookProcessingResult> {
    const paymentIntent = event.data.object;
    const stripePaymentIntentId = paymentIntent.id;

    try {
      const payment = await this.paymentRepository.resolveByPaymentIntentOrMetadata({
        paymentIntentId: stripePaymentIntentId,
        metadataPaymentId: getPaymentIdFromMetadata(paymentIntent),
      });

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handlePaymentIntentSucceeded",
          additionalData: { eventId: event.id, payment_intent: stripePaymentIntentId },
        });
        return okResult();
      }

      const expectedCurrency = "jpy";
      const paymentAmount: number | undefined = (payment as { amount?: number }).amount;
      const piAmount: number | undefined = (paymentIntent as { amount?: number }).amount;
      const piCurrency: string | undefined = (paymentIntent as { currency?: string }).currency;
      const hasDbAmount = typeof paymentAmount === "number";
      const hasPiAmount = typeof piAmount === "number";
      const hasPiCurrency = typeof piCurrency === "string";

      if (
        (hasDbAmount && hasPiAmount && piAmount !== paymentAmount) ||
        (hasPiCurrency && piCurrency && piCurrency.toLowerCase() !== expectedCurrency)
      ) {
        handleServerError("WEBHOOK_INVALID_PAYLOAD", {
          action: "handlePaymentIntentSucceeded",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            expectedAmount: hasDbAmount ? paymentAmount : undefined,
            actualAmount: hasPiAmount ? piAmount : undefined,
            expectedCurrency,
            actualCurrency: hasPiCurrency ? piCurrency : undefined,
            detail: "Amount or currency mismatch",
          },
        });

        return createWebhookInvalidPayloadError({
          code: "WEBHOOK_INVALID_PAYLOAD",
          reason: "amount_currency_mismatch",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "Webhook payload が不正です",
          message: "Amount or currency mismatch",
          details: {
            eventId: event.id,
            paymentId: payment.id,
            expectedAmount: hasDbAmount ? paymentAmount : undefined,
            actualAmount: hasPiAmount ? piAmount : undefined,
            expectedCurrency,
            actualCurrency: hasPiCurrency ? piCurrency : undefined,
          },
        });
      }

      if (!canPromoteStatus(payment.status as PaymentStatus, "paid")) {
        this.logger.info("Status promotion rule preventing update", {
          event_id: event.id,
          payment_id: payment.id,
          current_status: payment.status,
          outcome: "success",
        });
        return okResult();
      }

      const { error: updateError } = await this.paymentRepository.updateStatusPaidFromPaymentIntent(
        {
          paymentId: payment.id,
          eventId: event.id,
          stripePaymentIntentId,
        }
      );

      if (updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handlePaymentIntentSucceeded",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            payment_intent: stripePaymentIntentId,
            error_message: updateError.message,
            error_code: updateError.code,
          },
        });
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "payment_intent_succeeded_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "決済ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            paymentIntentId: stripePaymentIntentId,
          },
        });
      }

      const { data: attendanceData, error: attendanceError } = await this.supabase
        .from("attendances")
        .select("event_id")
        .eq("id", payment.attendance_id)
        .single();

      if (attendanceError || !attendanceData) {
        this.logger.warn("Revenue update skipped (attendance fetch failed)", {
          event_id: event.id,
          payment_id: payment.id,
          reason: "attendance_fetch_failed",
          error: attendanceError?.message ?? "No attendance data",
          outcome: "success",
        });
      } else {
        const { error: rpcError } = await this.supabase.rpc("update_revenue_summary", {
          p_event_id: attendanceData.event_id,
        });

        if (rpcError) {
          handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
            action: "handlePaymentIntentSucceeded",
            additionalData: {
              eventId: event.id,
              paymentId: payment.id,
              eventIdForRevenue: attendanceData.event_id,
              error: rpcError.message,
            },
          });
        }
      }

      this.logger.info("Payment intent succeeded processed", {
        event_id: event.id,
        payment_id: payment.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        outcome: "success",
      });

      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  async handleFailed(
    event: Stripe.PaymentIntentPaymentFailedEvent
  ): Promise<WebhookProcessingResult> {
    const paymentIntent = event.data.object;
    const stripePaymentIntentId = paymentIntent.id;

    try {
      const payment = await this.paymentRepository.resolveByPaymentIntentOrMetadata({
        paymentIntentId: stripePaymentIntentId,
        metadataPaymentId: getPaymentIdFromMetadata(paymentIntent),
      });
      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handlePaymentIntentFailed",
          additionalData: { eventId: event.id, payment_intent: stripePaymentIntentId },
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
        await this.paymentRepository.updateStatusFailedFromPaymentIntent({
          paymentId: payment.id,
          eventId: event.id,
          stripePaymentIntentId,
        });

      if (updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handlePaymentIntentFailed",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            payment_intent: stripePaymentIntentId,
            error_message: updateError.message,
            error_code: updateError.code,
          },
        });
        return createWebhookDbError({
          code: "WEBHOOK_UNEXPECTED_ERROR",
          reason: "payment_intent_failed_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "決済ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            paymentIntentId: stripePaymentIntentId,
          },
        });
      }

      const failureReason = paymentIntent.last_payment_error?.message || "Unknown payment failure";
      this.logger.info("Payment intent failed processed", {
        event_id: event.id,
        payment_id: payment.id,
        failure_reason: failureReason,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        outcome: "success",
      });

      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  async handleCanceled(event: Stripe.PaymentIntentCanceledEvent): Promise<WebhookProcessingResult> {
    const paymentIntent = event.data.object;
    const stripePaymentIntentId = paymentIntent.id;
    try {
      const payment = await this.paymentRepository.resolveByPaymentIntentOrMetadata({
        paymentIntentId: stripePaymentIntentId,
        metadataPaymentId: getPaymentIdFromMetadata(paymentIntent),
      });

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handlePaymentIntentCanceled",
          additionalData: { eventId: event.id, payment_intent: stripePaymentIntentId },
        });
        return okResult();
      }

      if (canPromoteStatus(payment.status as PaymentStatus, "failed")) {
        const { error: updateError } =
          await this.paymentRepository.updateStatusFailedFromPaymentIntent({
            paymentId: payment.id,
            eventId: event.id,
            stripePaymentIntentId,
          });
        if (updateError) {
          handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
            action: "handlePaymentIntentCanceled",
            additionalData: {
              eventId: event.id,
              paymentId: payment.id,
              payment_intent: stripePaymentIntentId,
              error_message: updateError.message,
              error_code: updateError.code,
            },
          });
          return createWebhookDbError({
            code: "WEBHOOK_UNEXPECTED_ERROR",
            reason: "payment_intent_canceled_update_failed",
            eventId: event.id,
            paymentId: payment.id,
            userMessage: "決済ステータス更新に失敗しました",
            dbError: updateError,
            details: {
              eventId: event.id,
              paymentId: payment.id,
              paymentIntentId: stripePaymentIntentId,
            },
          });
        }
      }

      this.logger.info("Payment intent canceled processed", {
        event_id: event.id,
        payment_id: payment.id,
        outcome: "success",
      });
      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }
}
