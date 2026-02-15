import Stripe from "stripe";

import { okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { getSettlementReportPort } from "@core/ports/settlements";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { PaymentDisputeInsert } from "@core/types/payment";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookHandlerContext } from "./context/webhook-handler-context";
import { createWebhookDbError, createWebhookUnexpectedError } from "./errors/webhook-error-factory";
import { ApplicationFeeHandler } from "./handlers/application-fee-handler";
import { ChargeHandler } from "./handlers/charge-handler";
import { CheckoutSessionHandler } from "./handlers/checkout-session-handler";
import { PaymentIntentHandler } from "./handlers/payment-intent-handler";
import { RefundHandler } from "./handlers/refund-handler";
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

function getExpandableId(value: string | { id: string } | null | undefined): string | null {
  if (isNonEmptyString(value)) {
    return value;
  }

  if (value && typeof value === "object" && isNonEmptyString(value.id)) {
    return value.id;
  }

  return null;
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

  private get refundHandler(): RefundHandler {
    if (!this.refundHandlerInstance) {
      this.refundHandlerInstance = new RefundHandler({
        paymentRepository: this.paymentWebhookRepository,
        stripeObjectFetchService: this.stripeFetchService,
        logger: this.logger,
        regenerateSettlementSnapshotFromPayment:
          this.regenerateSettlementSnapshotFromPayment.bind(this),
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
        regenerateSettlementSnapshotFromPayment:
          this.regenerateSettlementSnapshotFromPayment.bind(this),
      });
    }
    return this.applicationFeeHandlerInstance;
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
          handleDisputeEvent: this.handleDisputeEvent.bind(this),
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

  /**
   * 清算スナップショットの再生成を、payments→attendances→events の関連から特定して実行
   * 失敗時はログのみ（Webhook処理は継続）
   */
  private async regenerateSettlementSnapshotFromPayment(payment: unknown): Promise<void> {
    try {
      const paymentRecord = payment as { attendance_id?: string | null } | null;
      const attendanceId: string | null = (paymentRecord?.attendance_id ?? null) as string | null;
      if (!attendanceId) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "regenerateSettlementSnapshotFromPayment",
          additionalData: { paymentHasAttendanceId: false },
        });
        return;
      }

      const { data: attendance, error: attErr } = await this.supabase
        .from("attendances")
        .select("event_id")
        .eq("id", attendanceId)
        .maybeSingle();
      if (attErr || !attendance) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "regenerateSettlementSnapshotFromPayment",
          additionalData: { error: attErr?.message ?? "not_found", attendanceId },
        });
        return;
      }

      const eventId: string = (attendance as { event_id: string }).event_id;
      const { data: eventRow, error: evErr } = await this.supabase
        .from("events")
        .select("created_by")
        .eq("id", eventId)
        .maybeSingle();
      if (evErr || !eventRow) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "regenerateSettlementSnapshotFromPayment",
          additionalData: { error: evErr?.message ?? "not_found", eventId },
        });
        return;
      }

      const createdBy: string = (eventRow as { created_by: string }).created_by;

      const settlementPort = getSettlementReportPort();
      const res = await settlementPort.regenerateAfterRefundOrDispute(eventId, createdBy);
      if (!res.success) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "regenerateSettlementSnapshotFromPayment",
          additionalData: {
            eventId,
            createdBy,
            error: res.error.message,
          },
        });
        return;
      }

      this.logger.info("Settlement snapshot regenerated successfully", {
        event_id: eventId,
        created_by: createdBy,
        report_id: res.data?.reportId,
        outcome: "success",
      });
    } catch (e) {
      handleServerError("SETTLEMENT_REGENERATE_FAILED", {
        action: "regenerateSettlementSnapshotFromPayment",
        additionalData: { error: e instanceof Error ? e.message : "unknown" },
      });
    }
  }

  private async handleDisputeEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const dispute = event.data.object as Stripe.Dispute;
    this.logger.info("Dispute event received", {
      event_id: event.id,
      dispute_id: dispute.id,
      status: dispute.status,
      type: event.type,
      outcome: "success",
    });
    // Dispute 対象の支払を推定し、DB保存/更新 + 必要に応じてTransferリバーサル/再転送を実行
    try {
      const chargeId = getExpandableId(dispute.charge);
      const piId = getExpandableId(dispute.payment_intent);

      const payment = await this.paymentWebhookRepository.resolveForDispute({
        paymentIntentId: piId,
        chargeId,
      });
      const paymentId = payment?.id ?? null;

      // Dispute記録を保存/更新
      try {
        const currency = dispute.currency;
        const reason = dispute.reason;
        const evidenceDueByUnix = dispute.evidence_details?.due_by ?? null;
        const now = new Date().toISOString();

        const disputeUpsert: PaymentDisputeInsert = {
          payment_id: paymentId ?? null,
          stripe_dispute_id: dispute.id,
          charge_id: chargeId ?? null,
          payment_intent_id: piId ?? null,
          amount: dispute.amount ?? 0,
          currency: (currency || "jpy").toLowerCase(),
          reason: reason ?? null,
          status: dispute.status || "needs_response",
          evidence_due_by: evidenceDueByUnix
            ? new Date(evidenceDueByUnix * 1000).toISOString()
            : null,
          stripe_account_id: event.account ?? null,
          updated_at: now,
          closed_at: event.type === "charge.dispute.closed" ? now : null,
        };

        await this.supabase
          .from("payment_disputes")
          .upsert([disputeUpsert], { onConflict: "stripe_dispute_id" });
      } catch (e) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleDisputeEvent",
          additionalData: {
            eventId: event.id,
            disputeId: dispute.id,
            error: e instanceof Error ? e.message : "unknown",
          },
        });
      }

      // Destination charges: Transfer の reversal / 再転送は行わない
      if (payment) {
        try {
          await this.regenerateSettlementSnapshotFromPayment(payment);
        } catch {
          /* noop */
        }
      } else {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleDisputeEvent",
          additionalData: { eventId: event.id, chargeId, paymentIntentId: piId },
        });
      }
    } catch (e) {
      handleServerError("SETTLEMENT_REGENERATE_FAILED", {
        action: "handleDisputeEvent",
        additionalData: { eventId: event.id, error: e instanceof Error ? e.message : "unknown" },
      });
    }
    return okResult();
  }

  // transfer.* ハンドラは不要
  // getLatestTransferOrFallback / handleTransferCreated / handleTransferUpdated / handleTransferReversed を削除
}
