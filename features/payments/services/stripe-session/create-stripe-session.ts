import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentLogger } from "@core/logging/payment-logger";
import { generateSecureUuid } from "@core/security/crypto";
import * as DestinationCharges from "@core/stripe/destination-charges";
import { convertStripeError } from "@core/stripe/error-handler";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import { maskSessionId } from "@core/utils/mask";

import { Database } from "@/types/database";

import { ApplicationFeeCalculator } from "../fee-config/application-fee-calculator";
import { IPaymentErrorHandler } from "../interface";
import type { CreateStripeSessionParams, CreateStripeSessionResult } from "../types";
import { updateWithRetries } from "../utils/supabase-retry";

import { ensureStripePaymentRecord } from "./ensure-payment-record";

/**
 * Stripe決済セッションを作成する
 */
export async function createStripeSession(
  params: CreateStripeSessionParams,
  dependencies: {
    supabase: SupabaseClient<Database, "public">;
    paymentLogger: PaymentLogger;
    applicationFeeCalculator: ApplicationFeeCalculator;
    errorHandler: IPaymentErrorHandler;
  }
): Promise<CreateStripeSessionResult> {
  const { supabase, paymentLogger, applicationFeeCalculator, errorHandler } = dependencies;

  const correlationId = `session_${generateSecureUuid()}`;
  const contextLogger = paymentLogger.withContext({
    attendance_id: params.attendanceId,
    event_id: params.eventId,
    amount: params.amount,
    payment_method: "stripe",
    correlation_id: correlationId,
    connect_account_id: params.destinationCharges?.destinationAccountId,
  });

  contextLogger.startOperation("create_stripe_session", {
    actor_id: params.actorId,
    event_title: params.eventTitle,
  });

  try {
    const {
      paymentId: targetPaymentId,
      idempotencyKey: idempotencyKeyToUse,
      checkoutKeyRevision: checkoutKeyRevisionToSave,
    } = await ensureStripePaymentRecord(params, supabase, contextLogger);

    // Stripe Checkout Sessionを作成（Destination chargesに統一）
    if (!params.destinationCharges) {
      contextLogger.logPaymentError(
        "create_stripe_session",
        new Error("Destination charges configuration is required"),
        { payment_phase: "validation" }
      );
      throw new PaymentError(
        PaymentErrorType.VALIDATION_ERROR,
        "Destination charges configuration is required"
      );
    }
    const { destinationAccountId, userEmail, userName, setupFutureUsage } =
      params.destinationCharges;

    // Connect Account情報をログに記録（検証は別経路で実施済み）
    contextLogger.info("Connect Account validation skipped (handled upstream)", {
      connect_account_id: destinationAccountId,
      user_email: userEmail,
      user_name: userName,
      payment_id: targetPaymentId,
    });

    // Application fee計算
    const feeCalculation = await applicationFeeCalculator.calculateApplicationFee(params.amount);

    // Customer作成・取得
    let customerId: string | undefined;
    if (userEmail || userName) {
      const customer = await DestinationCharges.createOrRetrieveCustomer({
        email: userEmail,
        name: userName,
        metadata: {
          actor_id: params.actorId,
          event_id: params.eventId,
        },
      });
      customerId = customer.id;
    }

    // Destination charges用のCheckout Session作成
    // Idempotency-Key: 基本は新規発行（並行復帰時は確保済みキーを再利用する場合あり）
    const session = await DestinationCharges.createDestinationCheckoutSession({
      eventId: params.eventId,
      eventTitle: params.eventTitle,
      amount: params.amount,
      destinationAccountId,
      platformFeeAmount: feeCalculation.applicationFeeAmount,
      customerId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      actorId: params.actorId,
      gaClientId: params.gaClientId, // GA4 Client IDを渡す
      metadata: {
        payment_id: targetPaymentId,
        attendance_id: params.attendanceId,
        event_title: params.eventTitle,
      },
      setupFutureUsage,
      idempotencyKey: idempotencyKeyToUse,
    });

    // --- DB に Destination charges 関連情報を保存 (リトライ付き) ---
    const updateDestinationPayload = {
      stripe_checkout_session_id: session.id,
      destination_account_id: destinationAccountId,
      application_fee_amount: feeCalculation.applicationFeeAmount,
      transfer_group: `event_${params.eventId}_payout`,
      stripe_customer_id: customerId,
      checkout_idempotency_key: idempotencyKeyToUse,
      checkout_key_revision: checkoutKeyRevisionToSave,
    } as const;

    const { data: updatedPayment, error: lastDbError } = await updateWithRetries({
      attempt: async () => {
        const { data, error } = await supabase
          .from("payments")
          .update(updateDestinationPayload)
          .eq("id", targetPaymentId)
          .select("id, checkout_idempotency_key, checkout_key_revision")
          .maybeSingle();
        return { data, error };
      },
      isSuccess: ({ data, error }) => !error && !!data,
    });

    if (lastDbError || !updatedPayment) {
      const dbError = new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `Failed to update payment record with destination charges data after retries: ${
          lastDbError?.message ?? "no rows updated"
        }`,
        (lastDbError ?? undefined) as unknown as Error
      );
      await errorHandler.logError(dbError, {
        operation: "updateDestinationChargesData",
        paymentId: targetPaymentId,
        sessionId: maskSessionId(session.id),
        destinationAccountId,
        applicationFeeAmount: feeCalculation.applicationFeeAmount,
      });
      // 決済整合性のために処理を中断
      throw dbError;
    }

    // 既存のログも残しつつ、構造化ログも追加
    paymentLogger.info("Destination charges session created", {
      paymentId: targetPaymentId,
      sessionId: maskSessionId(session.id),
      amount: params.amount,
      applicationFeeAmount: feeCalculation.applicationFeeAmount,
      destinationAccountId,
      transferGroup: `event_${params.eventId}_payout`,
      actorId: params.actorId,
    });

    // 構造化ログでセッション作成成功を記録
    contextLogger.logSessionCreation(true, {
      payment_id: targetPaymentId,
      stripe_session_id: maskSessionId(session.id),
      session_url: session.url || undefined,
      application_fee_amount: feeCalculation.applicationFeeAmount,
      transfer_group: `event_${params.eventId}_payout`,
    });

    // 監査ログ記録
    const { logPayment } = await import("@core/logging/system-logger");
    await logPayment({
      action: "checkout.session_create",
      message: `Checkout session created: ${targetPaymentId}`,
      resource_id: targetPaymentId,
      outcome: "success",
      stripe_request_id: session.id,
      idempotency_key: idempotencyKeyToUse,
      metadata: {
        event_id: params.eventId,
        amount: session.amount_total,
        application_fee: feeCalculation.applicationFeeAmount,
        destination_account: destinationAccountId,
      },
    });

    if (!session.url) {
      throw new PaymentError(
        PaymentErrorType.STRIPE_API_ERROR,
        "Stripe session URL is not available"
      );
    }

    // 最終成功ログ
    contextLogger.operationSuccess("create_stripe_session", {
      payment_id: targetPaymentId,
      stripe_session_id: maskSessionId(session.id),
      session_url: session.url,
    });

    return {
      sessionUrl: session.url,
      sessionId: session.id,
    };
  } catch (error) {
    if (error instanceof PaymentError) {
      // PaymentErrorの場合もログに記録
      contextLogger.logPaymentError("create_stripe_session", error);
      throw error;
    }

    // 構造化ログでエラーを記録
    contextLogger.logPaymentError("create_stripe_session", error);

    // Stripe固有エラーの場合は汎用ハンドラーで詳細分類
    if (error && typeof error === "object" && "type" in error) {
      const stripeError = error as any;
      if (stripeError.type && typeof stripeError.type === "string") {
        const enhancedError = convertStripeError(stripeError, {
          operation: "create_stripe_session",
          connectAccountId: params.destinationCharges?.destinationAccountId,
          amount: params.amount,
          sessionId: undefined,
          additionalData: {
            event_id: params.eventId,
            attendance_id: params.attendanceId,
            actor_id: params.actorId,
          },
        });
        throw enhancedError;
      }
    }

    // その他のエラーの場合は汎用的なPaymentError
    const genericError = new PaymentError(
      PaymentErrorType.STRIPE_API_ERROR,
      "Stripe決済セッションの作成に失敗しました",
      error as Error
    );
    throw genericError;
  }
}
