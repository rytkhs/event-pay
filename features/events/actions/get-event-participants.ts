import { z } from "zod";

import { getOwnedEventContextForCurrentCommunity } from "@core/community/get-owned-event-context-for-current-community";
import {
  type ActionResult,
  ok,
  fail,
  toActionResultFromAppResult,
  zodFail,
} from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import {
  GetParticipantsParamsSchema,
  type GetParticipantsResponse,
  type ParticipantView,
} from "@core/validation/participant-management";

import {
  PAYMENTS_ORDER_CREATED_AT_DESC,
  PAYMENTS_ORDER_PAID_AT_DESC_NULLS_LAST,
  PAYMENTS_ORDER_UPDATED_AT_DESC,
} from "./_shared/payment-order";

type ParticipantPaymentRow = {
  id: string;
  method: "stripe" | "cash";
  status: "pending" | "paid" | "failed" | "received" | "refunded" | "waived" | "canceled";
  amount: number;
  paid_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_balance_transaction_id: string | null;
  stripe_customer_id: string | null;
  stripe_transfer_id: string | null;
  application_fee_id: string | null;
  application_fee_refund_id: string | null;
  webhook_event_id: string | null;
  webhook_processed_at: string | null;
  checkout_idempotency_key: string | null;
  checkout_key_revision: number | null;
  refunded_amount: number | null;
  application_fee_refunded_amount: number | null;
};

function hasBlockingPaymentTrace(payment: ParticipantPaymentRow): boolean {
  return (
    (payment.status !== "pending" && payment.status !== "canceled") ||
    payment.stripe_checkout_session_id != null ||
    payment.stripe_payment_intent_id != null ||
    payment.stripe_charge_id != null ||
    payment.stripe_balance_transaction_id != null ||
    payment.stripe_customer_id != null ||
    payment.stripe_transfer_id != null ||
    payment.application_fee_id != null ||
    payment.application_fee_refund_id != null ||
    payment.webhook_event_id != null ||
    payment.webhook_processed_at != null ||
    payment.checkout_idempotency_key != null ||
    (payment.checkout_key_revision ?? 0) > 0 ||
    payment.paid_at != null ||
    (payment.refunded_amount ?? 0) > 0 ||
    (payment.application_fee_refunded_amount ?? 0) > 0
  );
}

/**
 * イベント参加者全件取得
 * MANAGE-001: 参加者一覧表示
 *
 * attendancesとpaymentsを結合して完全な参加者情報を全件取得
 * フィルタリング・ソート・ページネーションはクライアントサイドで処理
 */
export async function getEventParticipantsAction(
  params: unknown
): Promise<ActionResult<GetParticipantsResponse>> {
  try {
    // パラメータバリデーション
    const parseResult = GetParticipantsParamsSchema.safeParse(params);
    if (!parseResult.success) {
      return zodFail(parseResult.error);
    }
    const { eventId, currentCommunityId } = parseResult.data;

    const supabase = await createServerComponentSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const accessResult = await getOwnedEventContextForCurrentCommunity(
      supabase,
      eventId,
      currentCommunityId
    );

    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", {
        userMessage: "イベント情報の取得に失敗しました",
      });
    }

    // シンプルな全件取得クエリ
    const selectColumns = `
      id,
      nickname,
      email,
      status,
      created_at,
      updated_at,
      payments!left (
        id,
        method,
        status,
        amount,
        paid_at,
        version,
        created_at,
        updated_at,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        stripe_charge_id,
        stripe_balance_transaction_id,
        stripe_customer_id,
        stripe_transfer_id,
        application_fee_id,
        application_fee_refund_id,
        webhook_event_id,
        webhook_processed_at,
        checkout_idempotency_key,
        checkout_key_revision,
        refunded_amount,
        application_fee_refunded_amount
      )`;

    const { data: attendances, error } = await supabase
      .from("attendances")
      .select(selectColumns)
      .eq("event_id", accessContext.id)
      // 最新決済を取得: paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
      .order("paid_at", PAYMENTS_ORDER_PAID_AT_DESC_NULLS_LAST)
      .order("created_at", PAYMENTS_ORDER_CREATED_AT_DESC)
      .order("updated_at", PAYMENTS_ORDER_UPDATED_AT_DESC)
      // デフォルトソート: 作成日時降順
      .order("created_at", { ascending: false });

    if (error) {
      return fail("DATABASE_ERROR", {
        userMessage: "参加者の取得に失敗しました",
        retryable: true,
      });
    }

    // 実際のSupabaseクエリ結果に合わせた型定義
    type SupabaseAttendanceWithPayments = {
      id: string;
      nickname: string;
      email: string;
      status: "attending" | "not_attending" | "maybe";
      created_at: string;
      updated_at: string;
      payments: ParticipantPaymentRow[] | null;
    };

    // データ変換（参加者ビュー形式に変換）
    const participants: ParticipantView[] = (
      (attendances as SupabaseAttendanceWithPayments[]) || []
    ).map((attendance) => {
      const latestPayment = (attendance.payments || [])[0] || null;
      const canDeleteMistakenAttendance = !(attendance.payments || []).some(
        hasBlockingPaymentTrace
      );

      return {
        attendance_id: attendance.id,
        nickname: attendance.nickname,
        email: attendance.email,
        status: attendance.status,
        attendance_created_at: attendance.created_at,
        attendance_updated_at: attendance.updated_at,
        payment_id: latestPayment?.id ?? null,
        payment_method: latestPayment?.method ?? null,
        payment_status: latestPayment?.status ?? null,
        amount: latestPayment?.amount ?? null,
        paid_at: latestPayment?.paid_at ?? null,
        payment_version: latestPayment?.version ?? null,
        payment_created_at: latestPayment?.created_at ?? null,
        payment_updated_at: latestPayment?.updated_at ?? null,
        can_delete_mistaken_attendance: canDeleteMistakenAttendance,
      };
    });

    logger.info("Event participants retrieved (all)", {
      category: "attendance",
      action: "get_event_participants",
      actor_type: "user",
      event_id: accessContext.id,
      user_id: user.id,
      participant_count: participants.length,
      outcome: "success",
    });

    return ok({ participants });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodFail(error);
    }

    handleServerError(error, {
      category: "attendance",
      action: "get_event_participants",
      actorType: "user",
      additionalData: {
        params: JSON.stringify(params),
      },
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "参加者の取得中にエラーが発生しました",
    });
  }
}
