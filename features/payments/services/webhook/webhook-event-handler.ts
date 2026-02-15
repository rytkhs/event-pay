import Stripe from "stripe";

import { okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { NotificationService } from "@core/notification/service";
import { getSettlementReportPort } from "@core/ports/settlements";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getMetadata, getPaymentIntentId } from "@core/stripe/guards";
import type { PaymentDisputeInsert, PaymentWebhookMetaJson } from "@core/types/payment";
import type { PaymentStatus } from "@core/types/statuses";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

import type { WebhookHandlerContext } from "./context/webhook-handler-context";
import {
  createWebhookDbError,
  createWebhookInvalidPayloadError,
  createWebhookUnexpectedError,
} from "./errors/webhook-error-factory";
import { CheckoutSessionHandler } from "./handlers/checkout-session-handler";
import { PaymentIntentHandler } from "./handlers/payment-intent-handler";
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
import {
  STRIPE_OBJECT_FETCH_POLICY,
  StripeObjectFetchService,
} from "./services/stripe-object-fetch-service";
import type { WebhookProcessingResult } from "./types";
import { getRefundFromWebhookEvent } from "./webhook-event-guards";

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

function getEventObjectFromRelation(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isRecord(candidate) ? candidate : null;
}

function extractPaymentNotificationDataFromAttendance(
  attendance: unknown
): { email: string; nickname: string; eventTitle: string } | null {
  if (!isRecord(attendance)) {
    return null;
  }

  const email = attendance.email;
  const nickname = attendance.nickname;
  const eventObject = getEventObjectFromRelation(attendance.event);
  const eventTitle = eventObject?.title;

  if (!isNonEmptyString(email) || !isNonEmptyString(nickname) || !isNonEmptyString(eventTitle)) {
    return null;
  }

  return { email, nickname, eventTitle };
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
  private checkoutSessionHandlerInstance?: CheckoutSessionHandler;
  private paymentIntentHandlerInstance?: PaymentIntentHandler;

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
          handleRefundCreated: this.handleRefundCreated.bind(this),
          handleRefundUpdated: this.handleRefundUpdated.bind(this),
          handleRefundFailed: this.handleRefundFailed.bind(this),
          handlePaymentIntentSucceeded: this.paymentIntentHandler.handleSucceeded.bind(
            this.paymentIntentHandler
          ),
          handlePaymentIntentFailed: this.paymentIntentHandler.handleFailed.bind(
            this.paymentIntentHandler
          ),
          handlePaymentIntentCanceled: this.paymentIntentHandler.handleCanceled.bind(
            this.paymentIntentHandler
          ),
          handleChargeSucceeded: this.handleChargeSucceeded.bind(this),
          handleChargeFailed: this.handleChargeFailed.bind(this),
          handleChargeRefunded: this.handleChargeRefunded.bind(this),
          handleCheckoutSessionCompleted: this.checkoutSessionHandler.handleCompleted.bind(
            this.checkoutSessionHandler
          ),
          handleCheckoutSessionExpired: this.checkoutSessionHandler.handleExpired.bind(
            this.checkoutSessionHandler
          ),
          handleCheckoutSessionAsyncPayment: this.checkoutSessionHandler.handleAsyncPayment.bind(
            this.checkoutSessionHandler
          ),
          handleApplicationFeeRefunded: this.handleApplicationFeeRefunded.bind(this),
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

  private async handleChargeSucceeded(
    event: Stripe.ChargeSucceededEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    // PaymentIntent/Chargeの再取得戦略は StripeObjectFetchService に集約
    try {
      this.logger.debug("Stripe object fetch policy applied", {
        event_id: event.id,
        trust_webhook_payload: STRIPE_OBJECT_FETCH_POLICY.trustWebhookPayload.join(","),
        always_retrieve_from_stripe: STRIPE_OBJECT_FETCH_POLICY.alwaysRetrieveFromStripe.join(","),
      });

      const stripePaymentIntentId = getPaymentIntentId(charge);
      const { charge: fetchedCharge, source: chargeSnapshotSource } =
        await this.stripeFetchService.getChargeSnapshotForChargeSucceeded({
          charge,
          stripePaymentIntentId,
        });
      this.logger.debug("Charge snapshot resolved for charge.succeeded", {
        event_id: event.id,
        event_charge_id: charge.id,
        snapshot_charge_id: fetchedCharge.id,
        charge_snapshot_source: chargeSnapshotSource,
      });

      const payment = await this.paymentWebhookRepository.resolveByChargeOrFallback({
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

      // 既に同等以上の状態なら冪等
      if (!canPromoteStatus(payment.status as PaymentStatus, "paid")) {
        this.logger.info("Duplicate webhook event preventing double processing", {
          event_id: event.id,
          payment_id: payment.id,
          current_status: payment.status,
          outcome: "success",
        });
        return okResult();
      }

      // balance_transaction / transfer / application_fee を拾う
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
        await this.paymentWebhookRepository.updateStatusPaidFromChargeSnapshot({
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

      // 監査ログ記録
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

      // 決済完了通知を送信（失敗してもログのみ記録）
      // NOTE: payment_intent.succeeded ではなく charge.succeeded で通知を送信する理由:
      // 1. 重複送信の防止（両方のイベントが発火するため）
      // 2. charge.succeeded では balance_transaction と transfer の情報も取得可能
      // 3. 実際の課金が完了した時点で通知するのがユーザー体験として適切
      try {
        const { data: attendance, error: fetchError } = await this.supabase
          .from("attendances")
          .select("email, nickname, event:events(title)")
          .eq("id", payment.attendance_id)
          .single();

        if (fetchError || !attendance) {
          this.logger.warn("Failed to fetch attendance for payment notification", {
            paymentId: payment.id,
            attendanceId: payment.attendance_id,
            error_message: fetchError?.message || "Attendance not found",
            outcome: "failure",
          });
          // 早期リターン: 通知失敗はwebhook処理を停止させない
        } else {
          const notificationData = extractPaymentNotificationDataFromAttendance(attendance);
          if (!notificationData) {
            this.logger.warn("Invalid attendance payload for payment notification", {
              paymentId: payment.id,
              attendanceId: payment.attendance_id,
              outcome: "failure",
            });
            return okResult(undefined, { eventId: event.id, paymentId: payment.id });
          }

          const notificationService = new NotificationService(this.supabase);
          await notificationService.sendPaymentCompletedNotification({
            email: notificationData.email,
            nickname: notificationData.nickname,
            eventTitle: notificationData.eventTitle,
            amount: payment.amount,
            paidAt: new Date().toISOString(),
            receiptUrl: charge.receipt_url ?? undefined,
          });
        }
      } catch (error) {
        // 通知失敗はログのみ記録、webhook処理は継続
        handleServerError("PAYMENT_COMPLETION_NOTIFICATION_FAILED", {
          action: "sendPaymentCompletedNotification",
          additionalData: {
            paymentId: payment.id,
            error_message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }

      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handleChargeFailed(
    event: Stripe.ChargeFailedEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    const stripePaymentIntentId = getPaymentIntentId(charge);
    try {
      const payment = await this.paymentWebhookRepository.resolveByChargeOrFallback({
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
      const { error: updateError } =
        await this.paymentWebhookRepository.updateStatusFailedFromCharge({
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

  private async handleChargeRefunded(
    event: Stripe.ChargeRefundedEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    // 累積返金額とアプリ手数料返金の保存
    try {
      // 支払レコードの特定
      const stripePaymentIntentId = getPaymentIntentId(charge);
      const payment = await this.paymentWebhookRepository.resolveByChargeOrFallback({
        paymentIntentId: stripePaymentIntentId,
        chargeId: charge.id,
        metadataPaymentId: getPaymentIdFromMetadata(charge),
      });

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleChargeRefunded",
          additionalData: {
            eventId: event.id,
            chargeId: charge.id,
          },
        });
        return okResult();
      }

      const totalRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
      // application_fee_refunds は Application Fee API 参照が必要。ここでは累積額を可能な範囲で保存
      let applicationFeeRefundedAmount = payment.application_fee_refunded_amount;
      let applicationFeeRefundId: string | null = payment.application_fee_refund_id;
      if (payment.application_fee_id) {
        try {
          // application_fee_id が保存されていれば合計返金額と最新の返金IDを取得
          const summed = await this.stripeFetchService.sumApplicationFeeRefunds(
            payment.application_fee_id
          );
          applicationFeeRefundedAmount = summed.amount;
          applicationFeeRefundId = summed.latestRefundId;
        } catch {
          // 取得失敗時は既存DB値を維持して上書きを防ぐ
        }
      } else {
        applicationFeeRefundedAmount = 0;
        applicationFeeRefundId = null;
      }

      // ステータス: 全額返金なら refunded、部分返金は paid のまま refunded_amount 更新
      const targetStatus: PaymentStatus =
        totalRefunded >= payment.amount ? "refunded" : (payment.status as PaymentStatus);
      // 巻き戻し防止: current >= target の場合は no-op
      if (!canPromoteStatus(payment.status as PaymentStatus, targetStatus as PaymentStatus)) {
        this.logger.info("Duplicate webhook event preventing double processing", {
          event_id: event.id,
          payment_id: payment.id,
          current_status: payment.status,
          target_status: targetStatus,
          outcome: "success",
        });
        return okResult();
      }

      const { error: updateError } = await this.paymentWebhookRepository.updateRefundAggregate({
        paymentId: payment.id,
        eventId: event.id,
        chargeId: charge.id,
        paymentIntentId: stripePaymentIntentId,
        status: targetStatus,
        refundedAmount: totalRefunded,
        applicationFeeRefundedAmount,
        applicationFeeRefundId,
      });
      if (updateError) {
        handleServerError("WEBHOOK_UNEXPECTED_ERROR", {
          action: "handleChargeRefunded",
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
          reason: "charge_refunded_update_failed",
          eventId: event.id,
          paymentId: payment.id,
          userMessage: "返金ステータス更新に失敗しました",
          dbError: updateError,
          details: {
            eventId: event.id,
            paymentId: payment.id,
            chargeId: charge.id,
          },
        });
      }

      this.logger.info("Refund processed successfully", {
        event_id: event.id,
        payment_id: payment.id,
        refunded_amount: totalRefunded,
        application_fee_refunded_amount: applicationFeeRefundedAmount,
        target_status: targetStatus,
        outcome: "success",
      });
      // 清算レポートの再生成を非同期で実行（失敗してもWebhook処理はACK）
      try {
        await this.regenerateSettlementSnapshotFromPayment(payment);
      } catch (e) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "handleChargeRefunded",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            error: e instanceof Error ? e.message : "unknown",
          },
        });
      }
      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handleRefundCreated(event: Stripe.Event): Promise<WebhookProcessingResult> {
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

  private async handleRefundUpdated(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const refund = getRefundFromWebhookEvent(event);
    if (!refund) {
      handleServerError("WEBHOOK_INVALID_PAYLOAD", {
        action: "handleRefundUpdated",
        additionalData: { eventId: event.id, detail: "Invalid refund object" },
      });
      return okResult();
    }

    const status = refund.status;

    // ログは常に記録
    this.logger.info("Refund updated event received", {
      event_id: event.id,
      refund_id: refund.id,
      status,
      outcome: "success",
    });

    // 返金がキャンセル/失敗に遷移した場合は、集計値を同期し直す（巻き戻しを許可）
    if (status === "canceled" || status === "failed") {
      const chargeId = getExpandableId(refund.charge);
      if (chargeId) {
        try {
          await this.syncRefundAggregateByChargeId(chargeId, event.id, /*allowDemotion*/ true);
        } catch (e) {
          // 集計同期失敗はDLQ再試行対象にするため例外を投げる
          throw e instanceof Error
            ? e
            : new Error("Failed to resync refund aggregate on refund.updated");
        }
      }
    }

    return okResult();
  }

  // refund.failed を受け、返金集計を再同期（必要ならステータスの巻き戻しを許可）
  private async handleRefundFailed(event: Stripe.Event): Promise<WebhookProcessingResult> {
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
      await this.syncRefundAggregateByChargeId(chargeId, event.id, /*allowDemotion*/ true);
    }
    return okResult();
  }

  // 指定した chargeId の最新状態をStripeから取得し、paymentsの返金集計とステータスを同期
  // allowDemotion=true のとき、全額返金でない場合に status=refunded からの巻き戻しを許可する
  private async syncRefundAggregateByChargeId(
    chargeId: string,
    eventId: string,
    allowDemotion = false
  ): Promise<void> {
    // 最新のChargeを取得
    const charge = await this.stripeFetchService.retrieveChargeForRefundAggregation(chargeId);
    await this.applyRefundAggregateFromCharge(charge, eventId, allowDemotion);
  }

  // Chargeスナップショットから返金集計をDBへ反映
  private async applyRefundAggregateFromCharge(
    charge: Stripe.Charge,
    eventId: string,
    allowDemotion = false
  ): Promise<void> {
    const stripePaymentIntentId = getPaymentIntentId(charge);
    const payment = await this.paymentWebhookRepository.resolveByChargeOrFallback({
      paymentIntentId: stripePaymentIntentId,
      chargeId: charge.id,
      metadataPaymentId: getPaymentIdFromMetadata(charge),
    });
    if (!payment) {
      handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
        action: "applyRefundAggregateFromCharge",
        additionalData: { eventId, chargeId: charge.id },
      });
      return;
    }

    const totalRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;

    // Application Fee の累積返金額を再計算
    let applicationFeeRefundedAmount = payment.application_fee_refunded_amount;
    let applicationFeeRefundId: string | null = payment.application_fee_refund_id;
    if (payment.application_fee_id) {
      try {
        const summed = await this.stripeFetchService.sumApplicationFeeRefunds(
          payment.application_fee_id
        );
        applicationFeeRefundedAmount = summed.amount;
        applicationFeeRefundId = summed.latestRefundId;
      } catch {
        // 取得失敗時は既存DB値を維持して上書きを防ぐ
      }
    } else {
      applicationFeeRefundedAmount = 0;
      applicationFeeRefundId = null;
    }

    // 目標ステータス: 全額返金であれば refunded。未満なら現状維持。ただし allowDemotion=true かつ現状refundedなら paid に戻す
    let targetStatus = payment.status as PaymentStatus;
    if (totalRefunded >= payment.amount) {
      targetStatus = "refunded" as PaymentStatus;
    } else if (allowDemotion && targetStatus === "refunded") {
      // もともと全額返金扱いだったが、失敗/取消で全額でなくなったケースを巻き戻す
      targetStatus = "paid" as PaymentStatus;
    }

    const { error } = await this.paymentWebhookRepository.updateRefundAggregate({
      paymentId: payment.id,
      eventId,
      chargeId: charge.id,
      paymentIntentId: stripePaymentIntentId,
      status: targetStatus,
      refundedAmount: totalRefunded,
      applicationFeeRefundedAmount,
      applicationFeeRefundId,
    });
    if (error) {
      throw new Error(`Failed to resync payment on refund change: ${error.message}`);
    }

    this.logger.info("Payment resynced from charge (refund)", {
      event_id: eventId,
      payment_id: payment.id,
      total_refunded: totalRefunded,
      target_status: targetStatus,
      resync: true,
      outcome: "success",
    });
  }

  private async handleApplicationFeeRefunded(
    event: Stripe.Event
  ): Promise<WebhookProcessingResult> {
    // application_fee.refunded は、手数料のみ返金（例外運用）を正確に反映するための補助イベント
    const obj = event.data?.object as
      | Stripe.ApplicationFee
      | (Stripe.FeeRefund & { fee: string | Stripe.ApplicationFee })
      | undefined;
    try {
      // 対象となる Application Fee ID を抽出
      // ケース1: data.object が ApplicationFee の場合
      // ケース2: data.object が ApplicationFeeRefund の場合（fee に紐づく）
      let applicationFeeId: string | null = null;
      if (obj) {
        if (
          (obj as Stripe.ApplicationFee).object === "application_fee" &&
          typeof (obj as Stripe.ApplicationFee).id === "string"
        ) {
          applicationFeeId = (obj as Stripe.ApplicationFee).id;
        } else if ((obj as Stripe.FeeRefund).object === "fee_refund") {
          const feeField = (obj as Stripe.FeeRefund & { fee: string | Stripe.ApplicationFee }).fee;
          if (typeof feeField === "string") {
            applicationFeeId = feeField;
          } else if (feeField && typeof feeField.id === "string") {
            applicationFeeId = feeField.id;
          }
        }
      }

      if (!applicationFeeId) {
        handleServerError("WEBHOOK_INVALID_PAYLOAD", {
          action: "handleApplicationFeeRefunded",
          additionalData: { eventId: event.id, detail: "No application fee ID found" },
        });
        return okResult();
      }

      // payments から対象レコードを特定
      const payment = await this.paymentWebhookRepository.findByApplicationFeeId(applicationFeeId);

      if (!payment) {
        handleServerError("WEBHOOK_PAYMENT_NOT_FOUND", {
          action: "handleApplicationFeeRefunded",
          additionalData: { eventId: event.id, applicationFeeId },
        });
        return okResult();
      }

      // 最新の手数料返金の累積額と最新IDを取得
      let applicationFeeRefundedAmount = payment.application_fee_refunded_amount;
      let applicationFeeRefundId: string | null = payment.application_fee_refund_id;
      try {
        const summed = await this.stripeFetchService.sumApplicationFeeRefunds(applicationFeeId);
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

      const { error: updateError } =
        await this.paymentWebhookRepository.updateApplicationFeeRefundAggregate({
          paymentId: payment.id,
          eventId: event.id,
          applicationFeeRefundedAmount,
          applicationFeeRefundId,
        });
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
      // プラットフォーム手数料返金も清算値へ影響するため再生成を実行
      try {
        await this.regenerateSettlementSnapshotFromPayment(payment);
      } catch (e) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: "handleApplicationFeeRefunded",
          additionalData: {
            eventId: event.id,
            paymentId: payment.id,
            error: e instanceof Error ? e.message : "unknown",
          },
        });
      }
      return okResult(undefined, { eventId: event.id, paymentId: payment.id });
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
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
