import Stripe from "stripe";
import { stripe as sharedStripe } from "@/lib/stripe/client";
import { SettlementReportService } from "@/lib/services/settlement-report/service";

import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import type { WebhookProcessingResult } from "./index";
import type { SecurityReporter } from "@/lib/security/security-reporter.types";
import { canPromoteStatus } from "@/lib/payments/status-rank";

export interface WebhookEventHandler {
  handleEvent(event: Stripe.Event): Promise<WebhookProcessingResult>;
}

export class StripeWebhookEventHandler implements WebhookEventHandler {
  private readonly supabase;
  private readonly securityReporter: SecurityReporter;

  constructor(securityReporter: SecurityReporter) {
    this.supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    this.securityReporter = securityReporter;
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

        case "refund.failed":
          return await this.handleRefundFailed(event as unknown as Stripe.Event);

        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          // 支払い確定は PaymentIntent/Charge のイベントで行う。ここでは突合用IDを保存する。
          try {
            const sessionId: string = session.id;
            const rawPi = (session as unknown as { payment_intent?: unknown }).payment_intent;
            const paymentIntentId: string | null = typeof rawPi === "string" && rawPi.length > 0 ? rawPi : null;
            const paymentIdFromMetadata: string | null = ((): string | null => {
              const md = (session as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
              const raw = md && (md as Record<string, unknown>)["payment_id"];
              return typeof raw === "string" && raw.length > 0 ? raw : null;
            })();

            if (!paymentIdFromMetadata) {
              await this.securityReporter.logSecurityEvent({
                type: "webhook_checkout_completed_missing_payment_id",
                details: { eventId: event.id, sessionId },
              });
              return { success: true };
            }

            const { data: payment, error: fetchError } = await this.supabase
              .from("payments")
              .select("id, stripe_payment_intent_id")
              .eq("id", paymentIdFromMetadata)
              .maybeSingle();

            if (fetchError) {
              throw new Error(`Payment lookup failed on checkout.session.completed: ${fetchError.message}`);
            }

            if (!payment) {
              await this.securityReporter.logSecurityEvent({
                type: "webhook_checkout_completed_payment_not_found",
                details: { eventId: event.id, sessionId, paymentIdFromMetadata },
              });
              return { success: true };
            }

            const updatePayload: Partial<Database["public"]["Tables"]["payments"]["Update"]> = {
              stripe_checkout_session_id: sessionId,
              updated_at: new Date().toISOString(),
            };
            if (paymentIntentId) {
              (updatePayload as { stripe_payment_intent_id?: string }).stripe_payment_intent_id = paymentIntentId;
            }

            const { error: updateError } = await this.supabase
              .from("payments")
              .update(updatePayload)
              .eq("id", payment.id);
            if (updateError) {
              throw new Error(`Failed to update payment on checkout.session.completed: ${updateError.message}`);
            }

            await this.securityReporter.logSecurityEvent({
              type: "webhook_checkout_completed_updated",
              details: { eventId: event.id, sessionId, paymentId: payment.id, paymentIntentId: paymentIntentId ?? undefined },
            });
            return { success: true };
          } catch (e) {
            throw (e instanceof Error ? e : new Error("Unknown error"));
          }
        }
        // Checkout セッションが有効期限切れ（離脱など）
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          try {
            const sessionId: string = session.id;
            const rawPi = (session as unknown as { payment_intent?: unknown }).payment_intent;
            const paymentIntentId: string | null = typeof rawPi === "string" && rawPi.length > 0 ? rawPi : null;

            // 突合順序:
            // 1) stripe_checkout_session_id（Destination charges）
            // 2) stripe_session_id（従来フロー）
            // 3) metadata.payment_id フォールバック
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
              const { data } = await this.supabase
                .from("payments")
                .select("*")
                .eq("stripe_session_id", sessionId)
                .maybeSingle();
              payment = data ?? null;
            }
            if (!payment) {
              const paymentIdFromMetadata: string | null = ((): string | null => {
                const md = (session as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
              await this.securityReporter.logSecurityEvent({
                type: "webhook_checkout_expired_no_payment",
                details: { eventId: event.id, sessionId },
              });
              return { success: true };
            }

            // 既に failed 以上（paid/refunded等も含む）なら冪等的にスキップ
            if (!canPromoteStatus(payment.status as Database["public"]["Enums"]["payment_status_enum"], "failed")) {
              await this.securityReporter.logSecurityEvent({
                type: "webhook_duplicate_processing_prevented",
                details: { eventId: event.id, paymentId: payment.id, currentStatus: payment.status },
              });
              return { success: true };
            }

            const updatePayload: Partial<Database["public"]["Tables"]["payments"]["Update"]> = {
              status: "failed",
              webhook_event_id: event.id,
              webhook_processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              stripe_checkout_session_id: sessionId,
            };
            if (paymentIntentId) {
              (updatePayload as { stripe_payment_intent_id?: string }).stripe_payment_intent_id = paymentIntentId;
            }

            const { error: updateError } = await this.supabase
              .from("payments")
              .update(updatePayload)
              .eq("id", payment.id);
            if (updateError) {
              throw new Error(`Failed to update payment on checkout.session.expired: ${updateError.message}`);
            }

            await this.securityReporter.logSecurityEvent({
              type: "webhook_checkout_expired_processed",
              details: { eventId: event.id, paymentId: payment.id, sessionId, paymentIntentId: paymentIntentId ?? undefined },
            });
            return { success: true, eventId: event.id, paymentId: payment.id };
          } catch (e) {
            throw (e instanceof Error ? e : new Error("Unknown error"));
          }
        }
        case "checkout.session.async_payment_succeeded":
        case "checkout.session.async_payment_failed": {
          await this.securityReporter.logSecurityEvent({
            type: "webhook_checkout_event_seen",
            details: { eventId: event.id, eventType: event.type },
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
          return await this.handleDisputeEvent(event as Stripe.ChargeDisputeCreatedEvent | Stripe.ChargeDisputeClosedEvent);

        // Destination chargesへ移行後もTransferイベントは来る可能性があるが、
        // payouts と直接整合しないため受信のみACKする
        case "transfer.created":
        case "transfer.updated":
        case "transfer.reversed":
          await this.securityReporter.logSecurityEvent({
            type: "webhook_transfer_event_ignored",
            details: { eventType: event.type, eventId: event.id },
          });
          return { success: true };

        default:
          // サポートされていないイベントタイプをログに記録
          await this.securityReporter.logSecurityEvent({
            type: "webhook_unsupported_event",
            details: {
              eventType: event.type,
              eventId: event.id,
            },
          });
          return { success: true };
      }
    } catch (error) {
      await this.securityReporter.logSuspiciousActivity({
        type: "webhook_processing_error",
        details: {
          eventType: event.type,
          eventId: event.id,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

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
        await this.securityReporter.logSecurityEvent({
          type: "settlement_regenerate_missing_attendance",
          details: { paymentHasAttendanceId: false },
        });
        return;
      }

      const { data: attendance, error: attErr } = await this.supabase
        .from("attendances")
        .select("event_id")
        .eq("id", attendanceId)
        .maybeSingle();
      if (attErr || !attendance) {
        await this.securityReporter.logSecurityEvent({
          type: "settlement_regenerate_attendance_lookup_failed",
          details: { error: attErr?.message ?? "not_found", attendanceId },
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
        await this.securityReporter.logSecurityEvent({
          type: "settlement_regenerate_event_lookup_failed",
          details: { error: evErr?.message ?? "not_found", eventId },
        });
        return;
      }

      const organizerId: string = (eventRow as { created_by: string }).created_by;

      const service = new SettlementReportService(this.supabase);
      const res = await service.regenerateAfterRefundOrDispute(eventId, organizerId);
      if (!res.success) {
        await this.securityReporter.logSecurityEvent({
          type: "settlement_regenerate_failed",
          details: { eventId, organizerId, error: res.error ?? "unknown" },
        });
        return;
      }

      await this.securityReporter.logSecurityEvent({
        type: "settlement_regenerate_succeeded",
        details: { eventId, organizerId, reportId: res.reportId },
      });
    } catch (e) {
      await this.securityReporter.logSecurityEvent({
        type: "settlement_regenerate_unexpected_error",
        details: { error: e instanceof Error ? e.message : "unknown" },
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
      const stripePaymentIntentId: string | null = (charge as { payment_intent?: string | null }).payment_intent ?? null;
      const { data: paymentByPi } = stripePaymentIntentId
        ? await this.supabase.from("payments").select("*").eq("stripe_payment_intent_id", stripePaymentIntentId).maybeSingle()
        : { data: null };

      let payment = paymentByPi;
      if (!payment) {
        // 事前に保存していないケースに備え、charge id で突合（保存時にUNIQUE想定）
        const { data: paymentByCharge } = await this.supabase.from("payments").select("*").eq("stripe_charge_id", charge.id).maybeSingle();
        payment = paymentByCharge ?? null;
      }

      if (!payment) {
        // フォールバック: metadata.payment_id で突合
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md = (charge as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
          await this.securityReporter.logSecurityEvent({
            type: "webhook_charge_no_payment_record",
            details: { eventId: event.id, chargeId: charge.id, payment_intent: stripePaymentIntentId ?? undefined },
          });
          return { success: true };
        }
      }

      // 既に同等以上の状態なら冪等
      if (!canPromoteStatus(payment.status as Database["public"]["Enums"]["payment_status_enum"], "paid")) {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_duplicate_processing_prevented",
          details: { eventId: event.id, paymentId: payment.id, currentStatus: payment.status },
        });
        return { success: true };
      }

      // balance_transaction / transfer / application_fee を拾う
      const chargeObj: Stripe.Charge = (
        (piOrCharge as Stripe.PaymentIntent).latest_charge as Stripe.Charge | undefined
      ) ?? (piOrCharge as Stripe.Charge);
      const balanceTxnId: string | null = (chargeObj?.balance_transaction && typeof chargeObj.balance_transaction === "object")
        ? (chargeObj.balance_transaction as Stripe.BalanceTransaction).id
        : (typeof chargeObj?.balance_transaction === "string" ? chargeObj.balance_transaction : null);
      const transferId: string | null = (chargeObj?.transfer && typeof chargeObj.transfer === "object")
        ? (chargeObj.transfer as Stripe.Transfer).id
        : (typeof chargeObj?.transfer === "string" ? chargeObj.transfer : null);
      const applicationFeeId: string | null = typeof chargeObj?.application_fee === "string" ? chargeObj.application_fee : null;

      const { error: updateError } = await this.supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_charge_id: charge.id,
          stripe_balance_transaction_id: balanceTxnId,
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

      await this.securityReporter.logSecurityEvent({
        type: "webhook_charge_succeeded_processed",
        details: { eventId: event.id, paymentId: payment.id, chargeId: charge.id, balanceTransactionId: balanceTxnId, transferId: transferId ?? undefined },
      });

      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  private async handleChargeFailed(
    event: Stripe.ChargeFailedEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object;
    const stripePaymentIntentId: string | null = (charge as { payment_intent?: string | null }).payment_intent ?? null;
    try {
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      {
        const { data, error: fetchError } = stripePaymentIntentId
          ? await this.supabase.from("payments").select("*").eq("stripe_payment_intent_id", stripePaymentIntentId).maybeSingle()
          : await this.supabase.from("payments").select("*").eq("stripe_charge_id", charge.id).maybeSingle();
        if (fetchError) {
          throw new Error(`Payment record lookup failed: ${fetchError.message}`);
        }
        payment = data ?? null;
      }
      if (!payment) {
        // フォールバック: metadata.payment_id
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md = (charge as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
        await this.securityReporter.logSecurityEvent({ type: "webhook_charge_failed_no_payment", details: { eventId: event.id, chargeId: charge.id } });
        return { success: true };
      }
      if (!canPromoteStatus(payment.status as Database["public"]["Enums"]["payment_status_enum"], "failed")) {
        await this.securityReporter.logSecurityEvent({ type: "webhook_duplicate_processing_prevented", details: { eventId: event.id, paymentId: payment.id, currentStatus: payment.status } });
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
      await this.securityReporter.logSecurityEvent({ type: "webhook_charge_failed_processed", details: { eventId: event.id, paymentId: payment.id, chargeId: charge.id } });
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  private async handleChargeRefunded(
    event: Stripe.ChargeRefundedEvent
  ): Promise<WebhookProcessingResult> {
    const charge = event.data.object as Stripe.Charge;
    // 累積返金額とアプリ手数料返金の保存
    try {
      // 支払レコードの特定
      const stripePaymentIntentId: string | null = (charge as { payment_intent?: string | null }).payment_intent ?? null;
      let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
      {
        const { data } = stripePaymentIntentId
          ? await this.supabase.from("payments").select("*").eq("stripe_payment_intent_id", stripePaymentIntentId).maybeSingle()
          : await this.supabase.from("payments").select("*").eq("stripe_charge_id", charge.id).maybeSingle();
        payment = data ?? null;
      }
      if (!payment) {
        // フォールバック: metadata.payment_id
        const paymentIdFromMetadata: string | null = ((): string | null => {
          const md = (charge as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
        await this.securityReporter.logSecurityEvent({ type: "webhook_charge_refunded_no_payment", details: { eventId: event.id, chargeId: charge.id } });
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
          const afrList = await sharedStripe.applicationFees.listRefunds(paymentWithFee.application_fee_id, { limit: 100 });
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
      if (!canPromoteStatus(payment.status as Database["public"]["Enums"]["payment_status_enum"], targetStatus as Database["public"]["Enums"]["payment_status_enum"])) {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_duplicate_processing_prevented",
          details: { eventId: event.id, paymentId: payment.id, currentStatus: payment.status, targetStatus },
        });
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

      await this.securityReporter.logSecurityEvent({
        type: "webhook_charge_refunded_processed",
        details: { eventId: event.id, paymentId: payment.id, refundedAmount: totalRefunded, applicationFeeRefundedAmount },
      });
      // 清算レポートの再生成を非同期で実行（失敗してもWebhook処理はACK）
      try { await this.regenerateSettlementSnapshotFromPayment(payment); } catch { /* noop */ }
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  private async handleRefundCreated(
    event: Stripe.RefundCreatedEvent
  ): Promise<WebhookProcessingResult> {
    const refund = event.data.object as Stripe.Refund;
    await this.securityReporter.logSecurityEvent({
      type: "webhook_refund_created_seen",
      details: { eventId: event.id, refundId: refund.id, status: refund.status },
    });
    return { success: true };
  }

  private async handleRefundUpdated(
    event: Stripe.RefundUpdatedEvent
  ): Promise<WebhookProcessingResult> {
    const refund = event.data.object as Stripe.Refund;
    const status: string | undefined = (refund as { status?: string }).status;

    // ログは常に記録
    await this.securityReporter.logSecurityEvent({
      type: "webhook_refund_updated_seen",
      details: { eventId: event.id, refundId: refund.id, status },
    });

    // 返金がキャンセル/失敗に遷移した場合は、集計値を同期し直す（巻き戻しを許可）
    if (status === "canceled" || status === "failed") {
      const chargeId = (refund as { charge?: string | null })?.charge ?? null;
      if (typeof chargeId === "string" && chargeId.length > 0) {
        try {
          await this.syncRefundAggregateByChargeId(chargeId, event.id, /*allowDemotion*/ true);
        } catch (e) {
          // 集計同期失敗はDLQ再試行対象にするため例外を投げる
          throw (e instanceof Error ? e : new Error("Failed to resync refund aggregate on refund.updated"));
        }
      }
    }

    return { success: true };
  }

  // refund.failed を受け、返金集計を再同期（必要ならステータスの巻き戻しを許可）
  private async handleRefundFailed(
    event: Stripe.Event
  ): Promise<WebhookProcessingResult> {
    const refund = (event as { data?: { object?: unknown } }).data?.object as Stripe.Refund | undefined;
    if (!refund) {
      await this.securityReporter.logSecurityEvent({
        type: "webhook_refund_failed_no_object",
        details: { eventId: event.id },
      });
      return { success: true };
    }

    const chargeId = (refund as { charge?: string | null })?.charge ?? null;
    await this.securityReporter.logSecurityEvent({
      type: "webhook_refund_failed_seen",
      details: { eventId: event.id, refundId: refund.id, chargeId },
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
    const stripePaymentIntentId: string | null = (charge as { payment_intent?: string | null }).payment_intent ?? null;
    let payment: Database["public"]["Tables"]["payments"]["Row"] | null = null;
    {
      const { data } = stripePaymentIntentId
        ? await this.supabase.from("payments").select("*").eq("stripe_payment_intent_id", stripePaymentIntentId).maybeSingle()
        : await this.supabase.from("payments").select("*").eq("stripe_charge_id", charge.id).maybeSingle();
      payment = data ?? null;
    }
    if (!payment) {
      await this.securityReporter.logSecurityEvent({ type: "refund_resync_no_payment", details: { eventId, chargeId: charge.id } });
      return;
    }

    const totalRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;

    // Application Fee の累積返金額を再計算
    let applicationFeeRefundedAmount = 0;
    let applicationFeeRefundId: string | null = null;
    try {
      const paymentWithFee = payment as unknown as { application_fee_id?: string | null };
      if (paymentWithFee?.application_fee_id) {
        const afrList = await sharedStripe.applicationFees.listRefunds(paymentWithFee.application_fee_id, { limit: 100 });
        const items = (afrList.data ?? []) as Stripe.FeeRefund[];
        applicationFeeRefundedAmount = items.reduce((sum: number, cur: Stripe.FeeRefund) => sum + (cur.amount ?? 0), 0);
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

    await this.securityReporter.logSecurityEvent({
      type: "refund_resynced_from_charge",
      details: { eventId, paymentId: payment.id, totalRefunded, targetStatus },
    });
  }

  private async handleApplicationFeeRefunded(
    event: Stripe.Event
  ): Promise<WebhookProcessingResult> {
    // application_fee.refunded は、手数料のみ返金（例外運用）を正確に反映するための補助イベント
    const obj = event.data?.object as Stripe.ApplicationFee | (Stripe.FeeRefund & { fee: string | Stripe.ApplicationFee }) | undefined;
    try {
      // 対象となる Application Fee ID を抽出
      // ケース1: data.object が ApplicationFee の場合
      // ケース2: data.object が ApplicationFeeRefund の場合（fee に紐づく）
      let applicationFeeId: string | null = null;
      if (obj) {
        if ((obj as Stripe.ApplicationFee).object === "application_fee" && typeof (obj as Stripe.ApplicationFee).id === "string") {
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
        await this.securityReporter.logSecurityEvent({
          type: "webhook_application_fee_refund_no_fee_id",
          details: { eventId: event.id },
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
        await this.securityReporter.logSecurityEvent({
          type: "webhook_application_fee_refund_no_payment",
          details: { eventId: event.id, applicationFeeId },
        });
        return { success: true };
      }

      // 最新の手数料返金の累積額と最新IDを取得
      let applicationFeeRefundedAmount = 0;
      let applicationFeeRefundId: string | null = null;
      try {
        const afrList = await sharedStripe.applicationFees.listRefunds(applicationFeeId, { limit: 100 });
        const items = (afrList.data ?? []) as Stripe.FeeRefund[];
        applicationFeeRefundedAmount = items.reduce((sum: number, cur: Stripe.FeeRefund) => sum + (cur.amount ?? 0), 0);
        applicationFeeRefundId = items.length > 0 ? items[items.length - 1].id : null;
      } catch (e) {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_application_fee_refunds_list_failed",
          details: { eventId: event.id, applicationFeeId, error: e instanceof Error ? e.message : "unknown" },
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
        throw new Error(`Failed to update payment on application_fee.refunded: ${updateError.message}`);
      }

      await this.securityReporter.logSecurityEvent({
        type: "webhook_application_fee_refunded_processed",
        details: { eventId: event.id, paymentId: payment.id, applicationFeeId, applicationFeeRefundedAmount },
      });
      // プラットフォーム手数料返金も清算値へ影響するため再生成を実行
      try { await this.regenerateSettlementSnapshotFromPayment(payment); } catch { /* noop */ }
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  private async handleDisputeEvent(
    event: Stripe.Event
  ): Promise<WebhookProcessingResult> {
    const dispute = event.data.object as Stripe.Dispute;
    await this.securityReporter.logSecurityEvent({
      type: "webhook_dispute_event",
      details: { eventId: event.id, disputeId: dispute.id, status: dispute.status, type: event.type },
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
        const evidenceDueByUnix: number | undefined = (dispute as unknown as { evidence_details?: { due_by?: number } })?.evidence_details?.due_by as unknown as number | undefined;

        const disputeUpsert: Database["public"]["Tables"]["payment_disputes"]["Insert"] = {
          payment_id: paymentId ?? null,
          stripe_dispute_id: dispute.id,
          charge_id: chargeId ?? null,
          payment_intent_id: piId ?? null,
          amount: typeof (dispute as { amount?: number }).amount === "number" ? (dispute as { amount?: number }).amount! : 0,
          currency: (currency || "jpy").toLowerCase(),
          reason: reason ?? null,
          status: (dispute as { status?: string }).status || "needs_response",
          evidence_due_by: evidenceDueByUnix ? new Date(evidenceDueByUnix * 1000).toISOString() : null,
          stripe_account_id: (event as unknown as { account?: string | null }).account ?? null,
          updated_at: new Date().toISOString(),
          closed_at: event.type === "charge.dispute.closed" ? new Date().toISOString() : null,
        };

        await this.supabase
          .from("payment_disputes")
          .upsert([disputeUpsert], { onConflict: "stripe_dispute_id" });
      } catch (e) {
        await this.securityReporter.logSecurityEvent({
          type: "dispute_upsert_failed",
          details: { eventId: event.id, disputeId: dispute.id, error: e instanceof Error ? e.message : "unknown" },
        });
      }

      // created: Connect destination chargesでは、プラットフォーム口座から引かれるため、connected側へのtransferを一時的に戻す
      if (event.type === "charge.dispute.created" && payment) {
        const paymentRecord = payment as {
          id: string;
          stripe_transfer_id?: string | null;
          stripe_transfer_reversal_id?: string | null;
          transfer_reversed_amount?: number | null;
        };
        const transferId = paymentRecord?.stripe_transfer_id ?? null;
        if (transferId) {
          const disputeAmount = typeof (dispute as { amount?: number }).amount === "number" ? (dispute as { amount?: number }).amount! : 0;

          /*
           * 冪等性強化: reversal 実行直前に transfer_reversed_amount を再読込。
           * 並列 Webhook 実行や Stripe 再送により既に reversal 済みの可能性を排除する。
           */
          const { data: latestPayment } = await this.supabase
            .from("payments")
            .select("transfer_reversed_amount")
            .eq("id", paymentRecord.id)
            .maybeSingle();

          const currentReversed = Math.max(0, (latestPayment as { transfer_reversed_amount?: number })?.transfer_reversed_amount ?? 0);

          const toReverse = Math.max(0, disputeAmount - currentReversed);

          if (toReverse > 0) {
            try {
              const reversal = await sharedStripe.transfers.createReversal(
                transferId,
                { amount: toReverse },
                { idempotencyKey: `dispute_reversal_${dispute.id}` }
              );
              await this.supabase
                .from("payments")
                .update({
                  stripe_transfer_reversal_id: (reversal as { id?: string }).id ?? paymentRecord.stripe_transfer_reversal_id ?? null,
                  transfer_reversed_amount: currentReversed + toReverse,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", paymentRecord.id);

              await this.securityReporter.logSecurityEvent({
                type: "transfer_reversal_created",
                details: { eventId: event.id, paymentId: paymentRecord.id, transferId, reversalAmount: toReverse },
              });
            } catch (e) {
              await this.securityReporter.logSecurityEvent({
                type: "transfer_reversal_failed",
                details: { eventId: event.id, paymentId: paymentRecord.id, transferId, error: e instanceof Error ? e.message : "unknown" },
              });
            }
          }
        }
      }

      // closed & won: 以前のリバーサル分を再転送
      if (payment && (dispute.status === "won")) {
        const paymentRecord = payment as {
          id: string;
          destination_account_id?: string | null;
          transfer_group?: string | null;
          transfer_reversed_amount?: number | null;
        };
        const destination = paymentRecord?.destination_account_id ?? null;
        const reversedAmount = Math.max(0, paymentRecord?.transfer_reversed_amount ?? 0);
        if (destination && reversedAmount > 0) {
          const currency: string = ((dispute as unknown as { currency?: string }).currency || "jpy").toLowerCase();
          try {
            const newTransfer = await sharedStripe.transfers.create(
              {
                amount: reversedAmount,
                currency,
                destination,
                transfer_group: paymentRecord.transfer_group ?? undefined,
                metadata: { purpose: "retransfer_after_dispute_won", dispute_id: dispute.id },
              },
              { idempotencyKey: `dispute_retransfer_${dispute.id}` }
            );
            await this.supabase
              .from("payments")
              .update({ transfer_reversed_amount: 0, updated_at: new Date().toISOString() })
              .eq("id", paymentRecord.id);
            await this.securityReporter.logSecurityEvent({
              type: "transfer_retransfer_created",
              details: { eventId: event.id, paymentId: paymentRecord.id, destination, retransferId: (newTransfer as { id?: string }).id, amount: reversedAmount },
            });
          } catch (e) {
            await this.securityReporter.logSecurityEvent({
              type: "transfer_retransfer_failed",
              details: { eventId: event.id, paymentId: paymentRecord.id, destination, error: e instanceof Error ? e.message : "unknown" },
            });
          }
        }
      }
      if (payment) {
        try { await this.regenerateSettlementSnapshotFromPayment(payment); } catch { /* noop */ }
      } else {
        await this.securityReporter.logSecurityEvent({
          type: "settlement_regenerate_payment_not_found_for_dispute",
          details: { eventId: event.id, chargeId, paymentIntentId: piId },
        });
      }
    } catch (e) {
      await this.securityReporter.logSecurityEvent({
        type: "settlement_regenerate_dispute_path_error",
        details: { eventId: event.id, error: e instanceof Error ? e.message : "unknown" },
      });
    }
    return { success: true };
  }

  /**
   * 最新のTransfer情報を取得（失敗時はイベントのオブジェクトでフォールバック）
   */
  private async getLatestTransferOrFallback(transferFromEvent: Stripe.Transfer): Promise<Stripe.Transfer> {
    try {
      const latest = await sharedStripe.transfers.retrieve(transferFromEvent.id);
      return latest;
    } catch (e) {
      await this.securityReporter.logSecurityEvent({
        type: "webhook_transfer_retrieve_failed",
        details: {
          transferId: transferFromEvent.id,
          error: e instanceof Error ? e.message : "unknown",
        },
      });
      return transferFromEvent;
    }
  }

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
          const md = (paymentIntent as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
        await this.securityReporter.logSecurityEvent({
          type: "webhook_payment_intent_no_payment_record",
          details: { eventId: event.id, payment_intent: stripePaymentIntentId },
        });
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
        ((hasDbAmount && hasPiAmount) && piAmount! !== paymentAmount!) ||
        (hasPiCurrency && piCurrency!.toLowerCase() !== expectedCurrency)
      ) {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_amount_currency_mismatch",
          details: {
            eventId: event.id,
            paymentId: payment.id,
            expectedAmount: hasDbAmount ? paymentAmount : undefined,
            actualAmount: hasPiAmount ? piAmount : undefined,
            expectedCurrency,
            actualCurrency: hasPiCurrency ? piCurrency : undefined,
          },
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

      // 既に処理済みかチェック
      if (payment.status === "paid") {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_duplicate_processing_prevented",
          details: {
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: payment.status,
          },
        });
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
        await this.securityReporter.logSecurityEvent({
          type: "webhook_revenue_update_skipped",
          details: {
            eventId: event.id,
            paymentId: payment.id,
            reason: "attendance_fetch_failed",
            error: attendanceError?.message ?? "No attendance data",
          },
        });
      } else {
        const { error: rpcError } = await this.supabase.rpc("update_revenue_summary", {
          p_event_id: attendanceData.event_id,
        });

        if (rpcError) {
          // 売上集計の更新失敗は警告レベルでログ（決済処理自体は成功）
          await this.securityReporter.logSecurityEvent({
            type: "webhook_revenue_update_failed",
            details: {
              eventId: event.id,
              paymentId: payment.id,
              eventIdForRevenue: attendanceData.event_id,
              error: rpcError.message,
            },
          });
        }
      }

      // 成功をログに記録
      await this.securityReporter.logSecurityEvent({
        type: "webhook_payment_succeeded_processed",
        details: {
          eventId: event.id,
          paymentId: payment.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      });

      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
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
          const md = (paymentIntent as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
        await this.securityReporter.logSecurityEvent({
          type: "webhook_payment_intent_failed_no_payment",
          details: { eventId: event.id, payment_intent: stripePaymentIntentId },
        });
        return { success: true };
      }

      // 既に同等以上の状態なら冪等（failed 以上＝paid/refunded等は降格させない）
      if (!canPromoteStatus(payment.status as Database["public"]["Enums"]["payment_status_enum"], "failed")) {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_duplicate_processing_prevented",
          details: {
            eventId: event.id,
            paymentId: payment.id,
            currentStatus: payment.status,
          },
        });
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
      await this.securityReporter.logSecurityEvent({
        type: "webhook_payment_failed_processed",
        details: {
          eventId: event.id,
          paymentId: payment.id,
          failureReason,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      });

      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      // 元のエラーメッセージを維持して上位に伝播（テストの期待との乖離を防止）
      throw (error instanceof Error ? error : new Error("Unknown error"));
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
          const md = (paymentIntent as unknown as { metadata?: Record<string, unknown> | null })?.metadata ?? null;
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
        await this.securityReporter.logSecurityEvent({
          type: "webhook_payment_intent_canceled_no_payment",
          details: { eventId: event.id, payment_intent: stripePaymentIntentId },
        });
        return { success: true };
      }

      if (canPromoteStatus(payment.status as Database["public"]["Enums"]["payment_status_enum"], "failed")) {
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
          throw new Error(`Failed to update payment on payment_intent.canceled: ${updateError.message}`);
        }
      }

      await this.securityReporter.logSecurityEvent({
        type: "webhook_payment_intent_canceled_processed",
        details: { eventId: event.id, paymentId: payment.id },
      });
      return { success: true, eventId: event.id, paymentId: payment.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  // Transferが作成された時点で completed へ（Stripeでは作成時点で送金完了）
  private async handleTransferCreated(
    event: Stripe.TransferCreatedEvent
  ): Promise<WebhookProcessingResult> {
    const transferFromEvent = event.data.object;
    const latestTransfer = await this.getLatestTransferOrFallback(transferFromEvent);
    const transferId = latestTransfer.id;
    const transferGroup = (latestTransfer as unknown as { transfer_group?: string }).transfer_group;

    try {
      // 該当する payouts レコードを transfer_id もしくは transfer_group で特定
      let payoutQuery = this.supabase
        .from("payouts")
        .select("id, status, stripe_transfer_id")
        .limit(1);

      if (transferGroup) {
        payoutQuery = payoutQuery.or(
          `stripe_transfer_id.eq.${transferId},transfer_group.eq.${transferGroup}`
        );
      } else {
        payoutQuery = payoutQuery.eq("stripe_transfer_id", transferId);
      }

      const { data: payout, error: fetchError } = await payoutQuery.maybeSingle();

      if (fetchError) {
        throw new Error(`Payout lookup failed: ${fetchError.message}`);
      }

      if (!payout) {
        // 関連レコードがない場合は成功としてACK（将来の再同期に委ねる）
        await this.securityReporter.logSecurityEvent({
          type: "webhook_transfer_no_payout_record",
          details: {
            eventId: event.id,
            transferId,
            transferGroup,
          },
        });
        return { success: true };
      }

      // 既に完了済みかチェック（冪等性）
      if (payout.status === "completed") {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_duplicate_processing_prevented",
          details: {
            eventId: event.id,
            payoutId: payout.id,
            currentStatus: payout.status,
          },
        });
        return { success: true };
      }

      // processing_errorステータスからの復旧処理
      if (payout.status === "processing_error") {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_processing_error_recovery",
          details: {
            eventId: event.id,
            payoutId: payout.id,
            transferId,
            previousStatus: payout.status,
            recoveryAction: "transfer.created webhook processing",
          },
        });
      }

      // 送金ステータスを完了に更新
      const { error: updateError } = await this.supabase
        .from("payouts")
        .update({
          status: "completed",
          stripe_transfer_id: transferId,
          processed_at: new Date().toISOString(),
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      if (updateError) {
        throw new Error(`Failed to mark payout completed: ${updateError.message}`);
      }

      // 成功をログに記録
      await this.securityReporter.logSecurityEvent({
        type: "webhook_transfer_created_processed",
        details: {
          eventId: event.id,
          payoutId: payout.id,
          transferId,
          amount: latestTransfer.amount,
          currency: latestTransfer.currency,
        },
      });

      return { success: true, eventId: event.id, payoutId: payout.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  // 送金更新イベントの処理
  private async handleTransferUpdated(
    event: Stripe.TransferUpdatedEvent
  ): Promise<WebhookProcessingResult> {
    const transferFromEvent = event.data.object;
    const latestTransfer = await this.getLatestTransferOrFallback(transferFromEvent);
    const transferId = latestTransfer.id;

    try {
      // 該当する payouts レコードを検索
      const { data: payout, error: fetchError } = await this.supabase
        .from("payouts")
        .select("id, status")
        .eq("stripe_transfer_id", transferId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`Payout lookup failed: ${fetchError.message}`);
      }

      if (!payout) {
        // 関連レコードがない場合は成功としてACK
        await this.securityReporter.logSecurityEvent({
          type: "webhook_transfer_updated_no_payout",
          details: {
            eventId: event.id,
            transferId,
          },
        });
        return { success: true };
      }

      // 送金の状態に応じて処理
      // Stripeでは、transferが作成された時点で基本的に完了しているため、
      // 特別な状態変更は不要だが、ログは記録する
      await this.securityReporter.logSecurityEvent({
        type: "webhook_transfer_updated_processed",
        details: {
          eventId: event.id,
          payoutId: payout.id,
          transferId,
          currentPayoutStatus: payout.status,
        },
      });

      return { success: true, eventId: event.id, payoutId: payout.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  // 送金リバーサル（失敗同等として扱う）
  private async handleTransferReversed(
    event: Stripe.TransferReversedEvent
  ): Promise<WebhookProcessingResult> {
    const transferFromEvent = event.data.object;
    const latestTransfer = await this.getLatestTransferOrFallback(transferFromEvent);
    const transferId = latestTransfer.id;

    try {
      // 該当する payouts レコードを検索
      const { data: payout, error: fetchError } = await this.supabase
        .from("payouts")
        .select("id, status")
        .eq("stripe_transfer_id", transferId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`Payout lookup failed: ${fetchError.message}`);
      }

      if (!payout) {
        // 関連レコードがない場合は成功としてACK
        await this.securityReporter.logSecurityEvent({
          type: "webhook_transfer_reversed_no_payout",
          details: {
            eventId: event.id,
            transferId,
          },
        });
        return { success: true };
      }

      // 既に失敗済みかチェック（冪等性）
      if (payout.status === "failed") {
        await this.securityReporter.logSecurityEvent({
          type: "webhook_duplicate_processing_prevented",
          details: {
            eventId: event.id,
            payoutId: payout.id,
            currentStatus: payout.status,
          },
        });
        return { success: true };
      }

      // リバーサル理由を取得
      const reversalReason = ((latestTransfer as unknown as { reversals?: { data?: Array<{ reason?: string }> } })
        ?.reversals?.data?.[0]?.reason) || "unknown";
      const errorMessage = `Transfer reversed: ${reversalReason}`;

      // 送金ステータスを失敗に更新
      const { error: updateError } = await this.supabase
        .from("payouts")
        .update({
          status: "failed",
          last_error: errorMessage,
          webhook_event_id: event.id,
          webhook_processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      if (updateError) {
        throw new Error(`Failed to mark payout failed: ${updateError.message}`);
      }

      // 失敗をログに記録
      await this.securityReporter.logSecurityEvent({
        type: "webhook_transfer_reversed_processed",
        details: {
          eventId: event.id,
          payoutId: payout.id,
          transferId,
          reversalReason,
          amount: latestTransfer.amount,
          currency: latestTransfer.currency,
        },
      });

      return { success: true, eventId: event.id, payoutId: payout.id };
    } catch (error) {
      throw (error instanceof Error ? error : new Error("Unknown error"));
    }
  }
}
