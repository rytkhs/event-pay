import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// import { emitPaymentCompleted, emitPaymentFailed } from "@core/events";
import { logger } from "@core/logging/app-logger";
import { NotificationService } from "@core/notification";
import { getSettlementReportPort } from "@core/ports/settlements";
import { logWebhookSecurityEvent } from "@core/security/security-logger";
import { stripe as sharedStripe } from "@core/stripe/client";
import { getRequiredEnvVar } from "@core/utils/env-helper";
import { maskSessionId } from "@core/utils/mask";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

// Removed @core/services dependency to break circular reference
// Use ports instead of direct feature import to avoid boundaries violation

import { Database } from "@/types/database";

import type { WebhookProcessingResult } from "./index";

export interface WebhookEventHandler {
  handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult>;
}

export class StripeWebhookEventHandler implements WebhookEventHandler {
  private readonly supabase;

  constructor() {
    this.supabase = createClient<Database>(
      getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  async handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          // 一次処理: PaymentIntent で決済成功を確定し、DB更新や集計を行う
          return await this.handlePaymentIntentSucceeded(
            event as Stripe.PaymentIntentSucceededEvent
          );
        }

        case "payment_intent.payment_failed":
          return await this.handlePaymentIntentFailed(
            event as Stripe.PaymentIntentPaymentFailedEvent
          );

        case "payment_intent.canceled":
          return await this.handlePaymentIntentCanceled(event as Stripe.PaymentIntentCanceledEvent);

        case "charge.succeeded":
          return await this.handleChargeSucceeded(event as Stripe.ChargeSucceededEvent);

        case "charge.failed":
          return await this.handleChargeFailed(event as Stripe.ChargeFailedEvent);

        case "charge.refunded":
          return await this.handleChargeRefunded(event as Stripe.ChargeRefundedEvent);

        case "refund.created":
          return await this.handleRefundCreated(event as Stripe.RefundCreatedEvent);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error Stripe typings may not yet include this literal
        case "charge.refund.created":
          return await this.handleRefundCreated(event as unknown as Stripe.RefundCreatedEvent);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error Stripe typings may not yet include this literal
        case "refund.failed":
          return await this.handleRefundFailed(event as unknown as Stripe.Event);

        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          // 支払い確定は PaymentIntent/Charge のイベントで行う。ここでは突合用IDを保存する。
          try {
            const sessionId: string = session.id;
            const rawPi = (session as unknown as { payment_intent?: unknown }).payment_intent;
            const paymentIntentId: string | null =
              typeof rawPi === "string" && rawPi.length > 0 ? rawPi : null;
            const paymentIdFromMetadata: string | null = ((): string | null => {
              const md =
                (session as unknown as { metadata?: Record<string, unknown> | null })?.metadata ??
                null;
              const raw = md && (md as Record<string, unknown>)["payment_id"];
              return typeof raw === "string" && raw.length > 0 ? raw : null;
            })();

            if (!paymentIdFromMetadata) {
              logWebhookSecurityEvent(
                "webhook_checkout_completed_missing_payment_id",
                "Webhook security event",
                { eventId: event.id, sessionId: maskSessionId(sessionId) }
              );
              return { success: true };
            }

            const { data: payment, error: fetchError } = await this.supabase
              .from("payments")
              .select("id, stripe_payment_intent_id")
              .eq("id", paymentIdFromMetadata)
              .maybeSingle();

            if (fetchError) {
              throw new Error(
                `Payment lookup failed on checkout.session.completed: ${fetchError.message}`
              );
            }

            if (!payment) {
              logWebhookSecurityEvent(
                "webhook_checkout_completed_payment_not_found",
                "Webhook security event",
                { eventId: event.id, sessionId: maskSessionId(sessionId), paymentIdFromMetadata }
              );
              return { success: true };
            }

            const updatePayload: Partial<Database["public"]["Tables"]["payments"]["Update"]> = {
              stripe_checkout_session_id: sessionId,
              updated_at: new Date().toISOString(),
              ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
            };

            const { error: updateError } = await this.supabase
              .from("payments")
              .update(updatePayload)
              .eq("id", payment.id);
            if (updateError) {
              throw new Error(
                `Failed to update payment on checkout.session.completed: ${updateError.message}`
              );
            }

            logWebhookSecurityEvent(
              "webhook_checkout_completed_updated",
              "Webhook security event",
              {
                eventId: event.id,
                sessionId: maskSessionId(sessionId),
                paymentId: payment.id,
                paymentIntentId: paymentIntentId ?? undefined,
              }
            );
            return { success: true };
          } catch (e) {
            throw e instanceof Error ? e : new Error("Unknown error");
          }
        }
        // Checkout セッションが有効期限切れ（離脱など）
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          try {
            const sessionId: string = session.id;
            const rawPi = (session as unknown as { payment_intent?: unknown }).payment_intent;
            const paymentIntentId: string | null =
              typeof rawPi === "string" && rawPi.length > 0 ? rawPi : null;

            // 突合順序:
            // 1) stripe_checkout_session_id（Destination charges）
            // 2) metadata.payment_id フォールバック
            let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
            {
              const { data } = await this.supabase
                .from("payments")
                .select("*")
                .eq("stripe_checkout_session_id", sessionId)
                .maybeSingle();
              payment = data ?? null;
            }
            if (!payment) {
              const paymentIdFromMetadata: string | null = ((): string | null => {
                const md =
                  (session as unknown as { metadata?: Record<string, unknown> | null })?.metadata ??
                  null;
                const raw = md && (md as Record<string, unknown>)["payment_id"];
                return typeof raw === "string" && raw.length > 0 ? raw : null;
              })();
              if (paymentIdFromMetadata) {
                const { data } = await this.supabase
                  .from("payments")
                  .select("*")
                  .eq("id", paymentIdFromMetadata)
                  .maybeSingle();
                payment = data ?? null;
              }
            }

            if (!payment) {
              logWebhookSecurityEvent(
                "webhook_checkout_expired_no_payment",
                "Webhook security event",
                { eventId: event.id, sessionId: maskSessionId(sessionId) }
              );
              return { success: true };
            }

            // 既に failed 以上（paid/refunded等も含む）なら冪等的にスキップ
            if (
              !canPromoteStatus(
                payment.status as Database["public"]["Enums"]["payment_status_enum"],
                "failed"
              )
            ) {
              logWebhookSecurityEvent(
                "webhook_duplicate_processing_prevented",
                "Webhook security event",
                {
                  eventId: event.id,
                  paymentId: payment.id,
                  currentStatus: payment.status,
                }
              );
              return { success: true };
            }

            const updatePayload: Partial<Database["public"]["Tables"]["payments"]["Update"]> = {
              status: "failed",
              webhook_event_id: event.id,
              webhook_processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              stripe_checkout_session_id: sessionId,
              ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
            };

            const { error: updateError } = await this.supabase
              .from("payments")
              .update(updatePayload)
              .eq("id", payment.id);
            if (updateError) {
              throw new Error(
                `Failed to update payment on checkout.session.expired: ${updateError.message}`
              );
            }

            logWebhookSecurityEvent(
              "webhook_checkout_expired_processed",
              "Webhook security event",
              {
                eventId: event.id,
                paymentId: payment.id,
                sessionId: maskSessionId(sessionId),
                paymentIntentId: paymentIntentId ?? undefined,
              }
            );
            return { success: true, eventId: event.id, paymentId: payment.id };
          } catch (e) {
            throw e instanceof Error ? e : new Error("Unknown error");
          }
        }
        case "checkout.session.async_payment_succeeded":
        case "checkout.session.async_payment_failed": {
          logWebhookSecurityEvent("webhook_checkout_event_seen", "Webhook security event", {
            eventId: event.id,
            eventType: event.type,
          });
          return { success: true };
        }
        case "refund.updated":
          return await this.handleRefundUpdated(event as Stripe.RefundUpdatedEvent);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore Stripe typings may not yet include this literal
        case "charge.refund.updated":
          return await this.handleRefundUpdated(event as unknown as Stripe.RefundUpdatedEvent);

        case "application_fee.refunded":
        case "application_fee.refund.updated":
          return await this.handleApplicationFeeRefunded(event as Stripe.Event);

        case "charge.dispute.created":
        case "charge.dispute.closed":
        case "charge.dispute.updated":
        case "charge.dispute.funds_reinstated":
          return await this.handleDisputeEvent(
            event as Stripe.ChargeDisputeCreatedEvent | Stripe.ChargeDisputeClosedEvent
          );

        // Destination chargesでは transfer.* は不使用
        case "transfer.created":
        case "transfer.updated":
        case "transfer.reversed":
          return { success: true };

        default:
          // サポートされていないイベントタイプをログに記録
          logWebhookSecurityEvent("webhook_unsupported_event", "Webhook security event", {
            eventType: event.type,
            eventId: event.id,
          });
          return { success: true };
      }
    } catch (error) {
      logWebhookSecurityEvent(
        "webhook_processing_error",
        "Webhook suspicious activity",
        {
          eventType: event.type,
          eventId: event.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        undefined,
        "MEDIUM"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
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
        logWebhookSecurityEvent(
          "settlement_regenerate_missing_attendance",
          "Webhook security event",
          { paymentHasAttendanceId: false }
        );
        return;
      }

      const { data: attendance, error: attErr } = await this.supabase
        .from("attendances")
        .select("event_id")
        .eq("id", attendanceId)
        .maybeSingle();
      if (attErr || !attendance) {
        logWebhookSecurityEvent(
          "settlement_regenerate_attendance_lookup_failed",
          "Webhook security event",
          { error: attErr?.message ?? "not_found", attendanceId }
        );
        return;
      }

      const eventId: string = (attendance as { event_id: string }).event_id;
      const { data: eventRow, error: evErr } = await this.supabase
        .from("events")
        .select("created_by")
        .eq("id", eventId)
        .maybeSingle();
      if (evErr || !eventRow) {
        logWebhookSecurityEvent(
          "settlement_regenerate_event_lookup_failed",
          "Webhook security event",
          { error: evErr?.message ?? "not_found", eventId }
        );
        return;
      }

      const createdBy: string = (eventRow as { created_by: string }).created_by;

      const settlementPort = getSettlementReportPort();
      const res = await settlementPort.regenerateAfterRefundOrDispute(eventId, createdBy);
      if (!res.success) {
        logWebhookSecurityEvent("settlement_regenerate_failed", "Webhook security event", {
          eventId,
          createdBy,
          error: res.error ?? "unknown",
        });
        return;
      }

      logWebhookSecurityEvent("settlement_regenerate_succeeded", "Webhook security event", {
        eventId,
        createdBy,
        reportId: res.reportId,
      });
    } catch (e) {
      logWebhookSecurityEvent("settlement_regenerate_unexpected_error", "Webhook security event", {
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  private async handleChargeSucceeded(
    event: Stripe.ChargeSucceededEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    // PaymentIntent拡張/charges.retrieveでbalance_tx/transferを取得
    try {
      let piOrCharge: Stripe.PaymentIntent | Stripe.Charge = charge as unknown as Stripe.Charge;
      if ((charge as { payment_intent?: string | null }).payment_intent) {
        try {
          const expanded = await sharedStripe.paymentIntents.retrieve(
            (charge as { payment_intent: string }).payment_intent,
            { expand: ["latest_charge.balance_transaction", "latest_charge.transfer"] }
          );
          piOrCharge = expanded;
        } catch {
          // フォールバックで charge を使用
        }
      } else {
        try {
          const retrieved = await sharedStripe.charges.retrieve(charge.id, {
            expand: ["balance_transaction", "transfer"],
          });
          piOrCharge = retrieved;
        } catch {
          // そのままchargeを利用
        }
      }

      // DBの payments を特定（stripe_payment_intent_id or charge_id のいずれか）
      const stripePaymentIntentId: string | null =
        (charge as { payment_intent?: string | null }).payment_intent ?? null;
      const { data: paymentByPi } = stripePaymentIntentId
        ? await this.supabase
            .from("payments")
            .select("*")
            .eq("stripe_payment_intent_id", stripePaymentIntentId)
            .maybeSingle()
        : { data: null };

      let payment = paymentByPi;
      if (!payment) {
        // 事前に保存していないケースに備え、charge id で突合（保存時にUNIQUE想定）
        const { data: paymentByCharge } = await this.supabase
          .from("payments")
          .select("*")
          .eq("stripe_charge_id", charge.id)
          .maybeSingle();
        payment = paymentByCharge ?? null;
      }

      if (!payment) {
        // フォールバック: metadata.payment_id で突合
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md =
            (charge as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
          const raw = md && (md as Record<string, unknown>)["payment_id"];
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })();

        if (paymentIdFromMetadata) {
          const { data: byId } = await this.supabase
            .from("payments")
            .select("*")
            .eq("id", paymentIdFromMetadata)
            .maybeSingle();
          if (byId) {
            payment = byId;
          }
        }

        if (!payment) {
          // 関連レコードがない場合もACK（将来の再同期に委譲）
          logWebhookSecurityEvent("webhook_charge_no_payment_record", "Webhook security event", {
            eventId: event.id,
            chargeId: charge.id,
            payment_intent: stripePaymentIntentId ?? undefined,
          });
          return { success: true };
        }
      }

      // 既に同等以上の状態なら冪等
      if (
        !canPromoteStatus(
          payment.status as Database["public"]["Enums"]["payment_status_enum"],
          "paid"
        )
      ) {
        logWebhookSecurityEvent(
          "webhook_duplicate_processing_prevented",
          "Webhook security event",
          { eventId: event.id, paymentId: payment.id, currentStatus: payment.status }
        );
        return { success: true };
      }

      // balance_transaction / transfer / application_fee を拾う
      const chargeObj: Stripe.Charge =
        ((piOrCharge as Stripe.PaymentIntent).latest_charge as Stripe.Charge | undefined) ??
        (piOrCharge as Stripe.Charge);
      const btObj = ((): {
        id: string | null;
        fee: number | null;
        net: number | null;
        fee_details: Array<{ amount?: number; currency?: string; type?: string }> | null;
      } => {
        const raw = chargeObj?.balance_transaction as unknown;
        if (raw && typeof raw === "object") {
          const tx = raw as Stripe.BalanceTransaction;
          return {
            id: tx.id,
            fee: typeof tx.fee === "number" ? tx.fee : null,
            net: typeof tx.net === "number" ? tx.net : null,
            fee_details: Array.isArray(tx.fee_details)
              ? tx.fee_details.map((fd) => ({
                  amount: fd.amount,
                  currency: (fd as any).currency,
                  type: (fd as any).type,
                }))
              : null,
          };
        }
        if (typeof raw === "string") {
          return { id: raw, fee: null, net: null, fee_details: null };
        }
        return { id: null, fee: null, net: null, fee_details: null };
      })();
      const balanceTxnId: string | null = btObj.id;
      const transferId: string | null =
        chargeObj?.transfer && typeof chargeObj.transfer === "object"
          ? (chargeObj.transfer as Stripe.Transfer).id
          : typeof chargeObj?.transfer === "string"
            ? chargeObj.transfer
            : null;
      const applicationFeeId: string | null =
        typeof chargeObj?.application_fee === "string" ? chargeObj.application_fee : null;

      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_charge_id: charge.id,
          stripe_balance_transaction_id: balanceTxnId,
          stripe_balance_transaction_fee: btObj.fee,
          stripe_balance_transaction_net: btObj.net,
          stripe_fee_details: btObj.fee_details as unknown as import("@/types/database").Json,
          stripe_transfer_id: transferId,
          application_fee_id: applicationFeeId,
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // 可能であれば Stripe PI を保存
          ...(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
        })
        .eq("id", payment.id);

      if (updateError) {
        throw new Error(`Failed to update payment on charge.succeeded: ${updateError.message}`);
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

      logWebhookSecurityEvent("webhook_charge_succeeded_processed", "Webhook security event", {
        eventId: event.id,
        paymentId: payment.id,
        chargeId: charge.id,
        balanceTransactionId: balanceTxnId,
        transferId: transferId ?? undefined,
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
          logger.warn("Failed to fetch attendance for payment notification", {
            tag: "paymentNotification",
            paymentId: payment.id,
            attendanceId: payment.attendance_id,
            error_message: fetchError?.message || "Attendance not found",
          });
          // 早期リターン: 通知失敗はwebhook処理を停止させない
        } else {
          interface AttendanceWithEvent {
            email: string;
            nickname: string;
            event: { title: string } | { title: string }[];
          }

          const typedAttendance = attendance as unknown as AttendanceWithEvent;
          const eventData = Array.isArray(typedAttendance.event)
            ? typedAttendance.event[0]
            : typedAttendance.event;

          const notificationService = new NotificationService(this.supabase);
          await notificationService.sendPaymentCompletedNotification({
            email: typedAttendance.email,
            nickname: typedAttendance.nickname,
            eventTitle: eventData.title,
            amount: payment.amount,
            paidAt: new Date().toISOString(),
            receiptUrl: charge.receipt_url ?? undefined,
          });
        }
      } catch (error) {
        // 通知失敗はログのみ記録、webhook処理は継続
        logger.warn("Failed to send payment completion notification", {
          tag: "paymentNotification",
          paymentId: payment.id,
          error_message: error instanceof Error ? error.message : "Unknown error",
        });
      }

      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handleChargeFailed(
    event: Stripe.ChargeFailedEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    const stripePaymentIntentId: string | null =
      (charge as { payment_intent?: string | null }).payment_intent ?? null;
    try {
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      {
        const { data, error: fetchError } = stripePaymentIntentId
          ? await this.supabase
              .from("payments")
              .select("*")
              .eq("stripe_payment_intent_id", stripePaymentIntentId)
              .maybeSingle()
          : await this.supabase
              .from("payments")
              .select("*")
              .eq("stripe_charge_id", charge.id)
              .maybeSingle();
        if (fetchError) {
          throw new Error(`Payment record lookup failed: ${fetchError.message}`);
        }
        payment = data ?? null;
      }
      if (!payment) {
        // フォールバック: metadata.payment_id
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md =
            (charge as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
          const raw = md && (md as Record<string, unknown>)["payment_id"];
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })();
        if (paymentIdFromMetadata) {
          const { data: byId } = await this.supabase
            .from("payments")
            .select("*")
            .eq("id", paymentIdFromMetadata)
            .maybeSingle();
          payment = byId ?? null;
        }
      }
      if (!payment) {
        logWebhookSecurityEvent("webhook_charge_failed_no_payment", "Webhook security event", {
          eventId: event.id,
          chargeId: charge.id,
        });
        return { success: true };
      }
      if (
        !canPromoteStatus(
          payment.status as Database["public"]["Enums"]["payment_status_enum"],
          "failed"
        )
      ) {
        logWebhookSecurityEvent(
          "webhook_duplicate_processing_prevented",
          "Webhook security event",
          { eventId: event.id, paymentId: payment.id, currentStatus: payment.status }
        );
        return { success: true };
      }
      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          status: "failed",
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
          stripe_charge_id: (charge as { id: string }).id,
        })
        .eq("id", payment.id);
      if (updateError) {
        throw new Error(`Failed to update payment on charge.failed: ${updateError.message}`);
      }
      logWebhookSecurityEvent("webhook_charge_failed_processed", "Webhook security event", {
        eventId: event.id,
        paymentId: payment.id,
        chargeId: charge.id,
      });
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handleChargeRefunded(
    event: Stripe.ChargeRefundedEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object as Stripe.Charge;
    // 累積返金額とアプリ手数料返金の保存
    try {
      // 支払レコードの特定
      const stripePaymentIntentId: string | null =
        (charge as { payment_intent?: string | null }).payment_intent ?? null;
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      {
        const { data } = stripePaymentIntentId
          ? await this.supabase
              .from("payments")
              .select("*")
              .eq("stripe_payment_intent_id", stripePaymentIntentId)
              .maybeSingle()
          : await this.supabase
              .from("payments")
              .select("*")
              .eq("stripe_charge_id", charge.id)
              .maybeSingle();
        payment = data ?? null;
      }
      if (!payment) {
        // フォールバック: metadata.payment_id
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md =
            (charge as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
          const raw = md && (md as Record<string, unknown>)["payment_id"];
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })();
        if (paymentIdFromMetadata) {
          const { data: byId } = await this.supabase
            .from("payments")
            .select("*")
            .eq("id", paymentIdFromMetadata)
            .maybeSingle();
          payment = byId ?? null;
        }
      }

      if (!payment) {
        logWebhookSecurityEvent("refund_payment_not_found", "Webhook security event", {
          eventId: event.id,
          chargeId: charge.id,
        });
        return { success: true };
      }

      const totalRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
      // application_fee_refunds は Application Fee API 参照が必要。ここでは累積額を可能な範囲で保存
      let applicationFeeRefundedAmount = 0;
      let applicationFeeRefundId: string | null = null;
      try {
        // application_fee_id が保存されていれば合計返金額と最新の返金IDを取得
        const paymentWithFee = payment as unknown as { application_fee_id?: string | null };
        if (paymentWithFee?.application_fee_id) {
          const afrList = await sharedStripe.applicationFees.listRefunds(
            paymentWithFee.application_fee_id,
            { limit: 100 }
          );
          const items = afrList.data ?? [];
          applicationFeeRefundedAmount = items.reduce((acc, cur) => acc + (cur.amount ?? 0), 0);
          applicationFeeRefundId = items.length > 0 ? items[items.length - 1].id : null;
        }
      } catch {
        // 取得失敗時は0/ nullのまま継続
      }

      // ステータス: 全額返金なら refunded、部分返金は paid のまま refunded_amount 更新
      const targetStatus = totalRefunded >= payment.amount ? "refunded" : payment.status;
      // 巻き戻し防止: current >= target の場合は no-op
      if (
        !canPromoteStatus(
          payment.status as Database["public"]["Enums"]["payment_status_enum"],
          targetStatus as Database["public"]["Enums"]["payment_status_enum"]
        )
      ) {
        logWebhookSecurityEvent(
          "webhook_duplicate_processing_prevented",
          "Webhook security event",
          {
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: payment.status,
            targetStatus,
          }
        );
        return { success: true };
      }

      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          status: targetStatus,
          refunded_amount: totalRefunded,
          application_fee_refund_id: applicationFeeRefundId,
          application_fee_refunded_amount: applicationFeeRefundedAmount,
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
          stripe_charge_id: charge.id,
        })
        .eq("id", payment.id);
      if (updateError) {
        throw new Error(`Failed to update payment on charge.refunded: ${updateError.message}`);
      }

      logWebhookSecurityEvent("refund_succeeded", "Webhook security event", {
        eventId: event.id,
        paymentId: payment.id,
        refundedAmount: totalRefunded,
        applicationFeeRefundedAmount,
        targetStatus,
      });
      // 清算レポートの再生成を非同期で実行（失敗してもWebhook処理はACK）
      try {
        await this.regenerateSettlementSnapshotFromPayment(payment);
      } catch (e) {
        logWebhookSecurityEvent(
          "settlement_regenerate_failed_on_refund",
          "Webhook security event",
          {
            eventId: event.id,
            paymentId: payment.id,
            error: e instanceof Error ? e.message : "unknown",
          }
        );
      }
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handleRefundCreated(
    event: Stripe.RefundCreatedEvent
  ): Promise<WebhookProcessingResult> {
    const refund = event.data.object as Stripe.Refund;
    logWebhookSecurityEvent("refund_created", "Webhook security event", {
      eventId: event.id,
      refundId: refund.id,
      status: refund.status,
    });
    return { success: true };
  }

  private async handleRefundUpdated(
    event: Stripe.RefundUpdatedEvent
  ): Promise<WebhookProcessingResult> {
    const refund = event.data.object as Stripe.Refund;
    const status: string | undefined = (refund as { status?: string }).status;

    // ログは常に記録
    logWebhookSecurityEvent("refund_updated", "Webhook security event", {
      eventId: event.id,
      refundId: refund.id,
      status,
    });

    // 返金がキャンセル/失敗に遷移した場合は、集計値を同期し直す（巻き戻しを許可）
    if (status === "canceled" || status === "failed") {
      const chargeId = (refund as { charge?: string | null })?.charge ?? null;
      if (typeof chargeId === "string" && chargeId.length > 0) {
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

    return { success: true };
  }

  // refund.failed を受け、返金集計を再同期（必要ならステータスの巻き戻しを許可）
  private async handleRefundFailed(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const refund = (event as { data?: { object?: unknown } }).data?.object as
      | Stripe.Refund
      | undefined;
    if (!refund) {
      logWebhookSecurityEvent("refund_failed_no_data", "Webhook security event", {
        eventId: event.id,
      });
      return { success: true };
    }

    const chargeId = (refund as { charge?: string | null })?.charge ?? null;
    logWebhookSecurityEvent("refund_failed", "Webhook security event", {
      eventId: event.id,
      refundId: refund.id,
      chargeId,
    });

    if (typeof chargeId === "string" && chargeId.length > 0) {
      await this.syncRefundAggregateByChargeId(chargeId, event.id, /*allowDemotion*/ true);
    }
    return { success: true };
  }

  // 指定した chargeId の最新状態をStripeから取得し、paymentsの返金集計とステータスを同期
  // allowDemotion=true のとき、全額返金でない場合に status=refunded からの巻き戻しを許可する
  private async syncRefundAggregateByChargeId(
    chargeId: string,
    eventId: string,
    allowDemotion = false
  ): Promise<void> {
    // 最新のChargeを取得
    const charge = await sharedStripe.charges.retrieve(chargeId);
    await this.applyRefundAggregateFromCharge(charge as Stripe.Charge, eventId, allowDemotion);
  }

  // Chargeスナップショットから返金集計をDBへ反映
  private async applyRefundAggregateFromCharge(
    charge: Stripe.Charge,
    eventId: string,
    allowDemotion = false
  ): Promise<void> {
    const stripePaymentIntentId: string | null =
      (charge as { payment_intent?: string | null }).payment_intent ?? null;
    let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
    {
      const { data } = stripePaymentIntentId
        ? await this.supabase
            .from("payments")
            .select("*")
            .eq("stripe_payment_intent_id", stripePaymentIntentId)
            .maybeSingle()
        : await this.supabase
            .from("payments")
            .select("*")
            .eq("stripe_charge_id", charge.id)
            .maybeSingle();
      payment = data ?? null;
    }
    if (!payment) {
      logWebhookSecurityEvent("refund_payment_not_found", "Webhook security event", {
        eventId,
        chargeId: charge.id,
      });
      return;
    }

    const totalRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;

    // Application Fee の累積返金額を再計算
    let applicationFeeRefundedAmount = 0;
    let applicationFeeRefundId: string | null = null;
    try {
      const paymentWithFee = payment as unknown as { application_fee_id?: string | null };
      if (paymentWithFee?.application_fee_id) {
        const afrList = await sharedStripe.applicationFees.listRefunds(
          paymentWithFee.application_fee_id,
          { limit: 100 }
        );
        const items = (afrList.data ?? []) as Stripe.FeeRefund[];
        applicationFeeRefundedAmount = items.reduce(
          (sum: number, cur: Stripe.FeeRefund) => sum + (cur.amount ?? 0),
          0
        );
        applicationFeeRefundId = items.length > 0 ? items[items.length - 1].id : null;
      }
    } catch {
      /* noop */
    }

    // 目標ステータス: 全額返金であれば refunded。未満なら現状維持。ただし allowDemotion=true かつ現状refundedなら paid に戻す
    let targetStatus = payment.status as Database["public"]["Enums"]["payment_status_enum"];
    if (totalRefunded >= payment.amount) {
      targetStatus = "refunded" as Database["public"]["Enums"]["payment_status_enum"];
    } else if (allowDemotion && targetStatus === "refunded") {
      // もともと全額返金扱いだったが、失敗/取消で全額でなくなったケースを巻き戻す
      targetStatus = "paid" as Database["public"]["Enums"]["payment_status_enum"];
    }

    const { error } = await this.supabase
      .from("payments")
      .update({
        status: targetStatus,
        refunded_amount: totalRefunded,
        application_fee_refund_id: applicationFeeRefundId,
        application_fee_refunded_amount: applicationFeeRefundedAmount,
        webhook_event_id: eventId,
        webhook_processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
        stripe_charge_id: charge.id,
      })
      .eq("id", payment.id);
    if (error) {
      throw new Error(`Failed to resync payment on refund change: ${error.message}`);
    }

    logWebhookSecurityEvent("refund_succeeded", "Webhook security event", {
      eventId,
      paymentId: payment.id,
      totalRefunded,
      targetStatus,
      resync: true,
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
        logWebhookSecurityEvent("application_fee_refund_no_fee_id", "Webhook security event", {
          eventId: event.id,
        });
        return { success: true };
      }

      // payments から対象レコードを特定
      const { data: payment } = await this.supabase
        .from("payments")
        .select("*")
        .eq("application_fee_id", applicationFeeId)
        .maybeSingle();

      if (!payment) {
        logWebhookSecurityEvent(
          "application_fee_refund_payment_not_found",
          "Webhook security event",
          { eventId: event.id, applicationFeeId }
        );
        return { success: true };
      }

      // 最新の手数料返金の累積額と最新IDを取得
      let applicationFeeRefundedAmount = 0;
      let applicationFeeRefundId: string | null = null;
      try {
        const afrList = await sharedStripe.applicationFees.listRefunds(applicationFeeId, {
          limit: 100,
        });
        const items = (afrList.data ?? []) as Stripe.FeeRefund[];
        applicationFeeRefundedAmount = items.reduce(
          (sum: number, cur: Stripe.FeeRefund) => sum + (cur.amount ?? 0),
          0
        );
        applicationFeeRefundId = items.length > 0 ? items[items.length - 1].id : null;
      } catch (e) {
        logWebhookSecurityEvent("application_fee_refunds_list_failed", "Webhook security event", {
          eventId: event.id,
          applicationFeeId,
          error: e instanceof Error ? e.message : "unknown",
        });
      }

      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          application_fee_refund_id: applicationFeeRefundId,
          application_fee_refunded_amount: applicationFeeRefundedAmount,
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      if (updateError) {
        throw new Error(
          `Failed to update payment on application_fee.refunded: ${updateError.message}`
        );
      }

      logWebhookSecurityEvent("application_fee_refunded", "Webhook security event", {
        eventId: event.id,
        paymentId: payment.id,
        applicationFeeId,
        applicationFeeRefundedAmount,
      });
      // プラットフォーム手数料返金も清算値へ影響するため再生成を実行
      try {
        await this.regenerateSettlementSnapshotFromPayment(payment);
      } catch (e) {
        logWebhookSecurityEvent(
          "settlement_regenerate_failed_on_refund",
          "Webhook security event",
          {
            eventId: event.id,
            paymentId: payment.id,
            error: e instanceof Error ? e.message : "unknown",
          }
        );
      }
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handleDisputeEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
    const dispute = event.data.object as Stripe.Dispute;
    logWebhookSecurityEvent("webhook_dispute_event", "Webhook security event", {
      eventId: event.id,
      disputeId: dispute.id,
      status: dispute.status,
      type: event.type,
    });
    // Dispute 対象の支払を推定し、DB保存/更新 + 必要に応じてTransferリバーサル/再転送を実行
    try {
      const chargeId: string | null = ((): string | null => {
        const raw = (dispute as unknown as { charge?: unknown }).charge;
        return typeof raw === "string" && raw.length > 0 ? raw : null;
      })();
      const piId: string | null = ((): string | null => {
        const raw = (dispute as unknown as { payment_intent?: unknown }).payment_intent;
        return typeof raw === "string" && raw.length > 0 ? raw : null;
      })();

      let payment: unknown | null = null;
      let paymentId: string | null = null;
      if (piId) {
        const { data } = await this.supabase
          .from("payments")
          .select("*")
          .eq("stripe_payment_intent_id", piId)
          .maybeSingle();
        payment = data ?? null;
        paymentId = (data as { id?: string } | null)?.id ?? null;
      }
      if (!payment && chargeId) {
        const { data } = await this.supabase
          .from("payments")
          .select("*")
          .eq("stripe_charge_id", chargeId)
          .maybeSingle();
        payment = data ?? null;
        paymentId = (data as { id?: string } | null)?.id ?? null;
      }

      // Dispute記録を保存/更新
      try {
        const currency: string | undefined = (dispute as unknown as { currency?: string }).currency;
        const reason: string | undefined = (dispute as unknown as { reason?: string }).reason;
        const evidenceDueByUnix: number | undefined = (
          dispute as unknown as { evidence_details?: { due_by?: number } }
        )?.evidence_details?.due_by as unknown as number | undefined;

        const disputeUpsert: Database["public"]["Tables"]["payment_disputes"]["Insert"] = {
          payment_id: paymentId ?? null,
          stripe_dispute_id: dispute.id,
          charge_id: chargeId ?? null,
          payment_intent_id: piId ?? null,
          amount: (dispute as { amount?: number }).amount ?? 0,
          currency: (currency || "jpy").toLowerCase(),
          reason: reason ?? null,
          status: (dispute as { status?: string }).status || "needs_response",
          evidence_due_by: evidenceDueByUnix
            ? new Date(evidenceDueByUnix * 1000).toISOString()
            : null,
          stripe_account_id: (event as unknown as { account?: string | null }).account ?? null,
          updated_at: new Date().toISOString(),
          closed_at: event.type === "charge.dispute.closed" ? new Date().toISOString() : null,
        };

        await this.supabase
          .from("payment_disputes")
          .upsert([disputeUpsert], { onConflict: "stripe_dispute_id" });
      } catch (e) {
        logWebhookSecurityEvent("dispute_upsert_failed", "Webhook security event", {
          eventId: event.id,
          disputeId: dispute.id,
          error: e instanceof Error ? e.message : "unknown",
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
        logWebhookSecurityEvent(
          "settlement_regenerate_payment_not_found_for_dispute",
          "Webhook security event",
          { eventId: event.id, chargeId, paymentIntentId: piId }
        );
      }
    } catch (e) {
      logWebhookSecurityEvent(
        "settlement_regenerate_dispute_path_error",
        "Webhook security event",
        { eventId: event.id, error: e instanceof Error ? e.message : "unknown" }
      );
    }
    return { success: true };
  }

  // transfer.* ハンドラは不要
  // getLatestTransferOrFallback / handleTransferCreated / handleTransferUpdated / handleTransferReversed を削除

  private async handlePaymentIntentSucceeded(
    event: Stripe.PaymentIntentSucceededEvent
  ): Promise<WebhookProcessingResult> {
    const paymentIntent = event.data.object;
    const stripePaymentIntentId = paymentIntent.id;

    try {
      // 決済レコードを検索（PI → metadata.payment_id フォールバック）
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      {
        const { data, error: fetchError } = await this.supabase
          .from("payments")
          .select("*")
          .eq("stripe_payment_intent_id", stripePaymentIntentId)
          .maybeSingle();
        if (fetchError) {
          throw new Error(`Payment record lookup failed: ${fetchError.message}`);
        }
        payment = data ?? null;
      }

      if (!payment) {
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md =
            (paymentIntent as unknown as { metadata?: Record<string, unknown> | null })?.metadata ??
            null;
          const raw = md && (md as Record<string, unknown>)["payment_id"];
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })();

        if (paymentIdFromMetadata) {
          const { data } = await this.supabase
            .from("payments")
            .select("*")
            .eq("id", paymentIdFromMetadata)
            .maybeSingle();
          payment = data ?? null;
        }
      }

      if (!payment) {
        logWebhookSecurityEvent(
          "webhook_payment_intent_no_payment_record",
          "Webhook security event",
          { eventId: event.id, payment_intent: stripePaymentIntentId }
        );
        return { success: true };
      }

      // 金額・通貨の整合性チェック（通貨はプラットフォーム既定のJPY想定）
      // テストのモックでは amount が省略される場合があるため、厳密チェックは値が揃っているときのみ実施
      const expectedCurrency = "jpy"; // 必要に応じて設定化
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
        logWebhookSecurityEvent("webhook_amount_currency_mismatch", "Webhook security event", {
          eventId: event.id,
          paymentId: payment.id,
          expectedAmount: hasDbAmount ? paymentAmount : undefined,
          actualAmount: hasPiAmount ? piAmount : undefined,
          expectedCurrency,
          actualCurrency: hasPiCurrency ? piCurrency : undefined,
        });

        // 終端エラーとして扱う（再試行しても成功しない）
        return {
          success: false,
          error: "Amount or currency mismatch",
          terminal: true,
          reason: "amount_currency_mismatch",
          eventId: event.id,
          paymentId: payment.id,
        };
      }

      // 既に処理済みかチェック（ステータスランクによる昇格可能性チェック）
      if (
        !canPromoteStatus(
          payment.status as Database["public"]["Enums"]["payment_status_enum"],
          "paid"
        )
      ) {
        logWebhookSecurityEvent(
          "webhook_duplicate_processing_prevented",
          "Webhook security event",
          {
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: payment.status,
          }
        );
        return { success: true }; // 重複処理を防止
      }

      // 決済ステータスを更新
      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .eq("id", payment.id);

      if (updateError) {
        throw new Error(`Failed to update payment status: ${updateError.message}`);
      }

      // 売上集計を更新（RPC関数を呼び出し）
      const { data: attendanceData, error: attendanceError } = await this.supabase
        .from("attendances")
        .select("event_id")
        .eq("id", payment.attendance_id)
        .single();

      if (attendanceError || !attendanceData) {
        // 参加情報取得に失敗した場合は警告ログのみ記録し、決済処理自体は成功扱いにする
        logWebhookSecurityEvent("webhook_revenue_update_skipped", "Webhook security event", {
          eventId: event.id,
          paymentId: payment.id,
          reason: "attendance_fetch_failed",
          error: attendanceError?.message ?? "No attendance data",
        });
      } else {
        const { error: rpcError } = await this.supabase.rpc("update_revenue_summary", {
          p_event_id: attendanceData.event_id,
        });

        if (rpcError) {
          // 売上集計の更新失敗は警告レベルでログ（決済処理自体は成功）
          logWebhookSecurityEvent("webhook_revenue_update_failed", "Webhook security event", {
            eventId: event.id,
            paymentId: payment.id,
            eventIdForRevenue: attendanceData.event_id,
            error: rpcError.message,
          });
        }
      }

      // 成功をログに記録
      logWebhookSecurityEvent("webhook_payment_succeeded_processed", "Webhook security event", {
        eventId: event.id,
        paymentId: payment.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      });

      // NOTE: 決済完了通知は charge.succeeded で送信
      // payment_intent.succeeded と charge.succeeded の両方が発火するため、
      // 重複送信を避けるため charge.succeeded でのみ通知を送信している
      // （charge.succeeded では balance_transaction と transfer の情報も取得可能）

      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handlePaymentIntentFailed(
    event: Stripe.PaymentIntentPaymentFailedEvent
  ): Promise<WebhookProcessingResult> {
    const paymentIntent = event.data.object;
    const stripePaymentIntentId = paymentIntent.id;

    try {
      // 決済レコードを検索（PI → metadata.payment_id フォールバック）
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      {
        const { data, error: fetchError } = await this.supabase
          .from("payments")
          .select("*")
          .eq("stripe_payment_intent_id", stripePaymentIntentId)
          .maybeSingle();
        if (fetchError) {
          throw new Error(`Payment record lookup failed: ${fetchError.message}`);
        }
        payment = data ?? null;
      }
      if (!payment) {
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md =
            (paymentIntent as unknown as { metadata?: Record<string, unknown> | null })?.metadata ??
            null;
          const raw = md && (md as Record<string, unknown>)["payment_id"];
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })();
        if (paymentIdFromMetadata) {
          const { data } = await this.supabase
            .from("payments")
            .select("*")
            .eq("id", paymentIdFromMetadata)
            .maybeSingle();
          payment = data ?? null;
        }
      }
      if (!payment) {
        logWebhookSecurityEvent(
          "webhook_payment_intent_failed_no_payment",
          "Webhook security event",
          { eventId: event.id, payment_intent: stripePaymentIntentId }
        );
        return { success: true };
      }

      // 既に同等以上の状態なら冪等（failed 以上＝paid/refunded等は降格させない）
      if (
        !canPromoteStatus(
          payment.status as Database["public"]["Enums"]["payment_status_enum"],
          "failed"
        )
      ) {
        logWebhookSecurityEvent(
          "webhook_duplicate_processing_prevented",
          "Webhook security event",
          {
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: payment.status,
          }
        );
        return { success: true }; // 重複処理を防止
      }

      // 決済ステータスを失敗に更新（昇格のみ許可）
      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          status: "failed",
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .eq("id", payment.id);

      if (updateError) {
        throw new Error(`Failed to update payment status: ${updateError.message}`);
      }

      // 失敗理由をログに記録
      const failureReason = paymentIntent.last_payment_error?.message || "Unknown payment failure";
      logWebhookSecurityEvent("webhook_payment_failed_processed", "Webhook security event", {
        eventId: event.id,
        paymentId: payment.id,
        failureReason,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      });

      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      // 元のエラーメッセージを維持して上位に伝播（テストの期待との乖離を防止）
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }

  private async handlePaymentIntentCanceled(
    event: Stripe.PaymentIntentCanceledEvent
  ): Promise<WebhookProcessingResult> {
    const paymentIntent = event.data.object;
    const stripePaymentIntentId = paymentIntent.id;
    try {
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      const { data: byPi, error: fetchError } = await this.supabase
        .from("payments")
        .select("*")
        .eq("stripe_payment_intent_id", stripePaymentIntentId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`Payment record not found: ${fetchError.message}`);
      }
      payment = byPi ?? null;

      if (!payment) {
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md =
            (paymentIntent as unknown as { metadata?: Record<string, unknown> | null })?.metadata ??
            null;
          const raw = md && (md as Record<string, unknown>)["payment_id"];
          return typeof raw === "string" && raw.length > 0 ? raw : null;
        })();
        if (paymentIdFromMetadata) {
          const { data } = await this.supabase
            .from("payments")
            .select("*")
            .eq("id", paymentIdFromMetadata)
            .maybeSingle();
          payment = data ?? null;
        }
      }

      if (!payment) {
        logWebhookSecurityEvent(
          "webhook_payment_intent_canceled_no_payment",
          "Webhook security event",
          { eventId: event.id, payment_intent: stripePaymentIntentId }
        );
        return { success: true };
      }

      if (
        canPromoteStatus(
          payment.status as Database["public"]["Enums"]["payment_status_enum"],
          "failed"
        )
      ) {
        const { error: updateError } = await this.supabase
          .from("payments")
          .update({
            status: "failed",
            webhook_event_id: event.id,
            webhook_processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stripe_payment_intent_id: stripePaymentIntentId,
          })
          .eq("id", payment.id);
        if (updateError) {
          throw new Error(
            `Failed to update payment on payment_intent.canceled: ${updateError.message}`
          );
        }
      }

      logWebhookSecurityEvent(
        "webhook_payment_intent_canceled_processed",
        "Webhook security event",
        { eventId: event.id, paymentId: payment.id }
      );
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unknown error");
    }
  }
}
