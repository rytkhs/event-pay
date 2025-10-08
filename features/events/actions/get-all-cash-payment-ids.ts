"use server";

import { verifyEventAccess, handleDatabaseError } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { logPayment } from "@core/logging/system-logger";
import { createClient } from "@core/supabase/server";
import {
  type SimplePaymentStatus,
  getPaymentStatusesFromSimple,
} from "@core/utils/payment-status-mapper";
import {
  GetAllCashPaymentIdsParamsSchema,
  type GetAllCashPaymentIdsResponse,
} from "@core/validation/participant-management";

/**
 * 条件に合致する「現金決済」の最新行の payment_id を全件返す
 * - フィルタは参加者一覧/CSVエクスポートに準拠
 * - 最新決済の定義: payments を paid_at DESC NULLS LAST → created_at DESC → updated_at DESC で 1 件
 * - 上限: max + 1 を取得して打ち切り判定
 */
export async function getAllCashPaymentIdsAction(
  params: unknown
): Promise<GetAllCashPaymentIdsResponse> {
  try {
    const validated = GetAllCashPaymentIdsParamsSchema.parse(params);
    const { eventId, filters, max } = validated;

    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    const supabase = createClient();

    // attendances をベースに latest payments を 1 件だけ付ける
    let query = supabase
      .from("attendances")
      .select(`id, payments!inner ( id, method, status, paid_at, created_at, updated_at )`)
      .eq("event_id", validatedEventId)
      // 最新 1 件に制約
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("paid_at", { foreignTable: "payments", ascending: false, nullsFirst: false } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("created_at", { foreignTable: "payments", ascending: false } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("updated_at", { foreignTable: "payments", ascending: false } as any)
      .limit(1, { foreignTable: "payments" })
      // 現金決済に限定
      .eq("payments.method", "cash");

    // 検索/フィルタ
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      query = query.or(`nickname.ilike.${pattern},email.ilike.${pattern}`);
    }
    if (filters?.attendanceStatus) {
      query = query.eq("status", filters.attendanceStatus);
    }
    if (filters?.paymentStatus) {
      const detailedStatuses = getPaymentStatusesFromSimple(
        filters.paymentStatus as SimplePaymentStatus
      );

      if (detailedStatuses.length === 1) {
        query = query.eq("payments.status", detailedStatuses[0]);
      } else {
        query = query.in("payments.status", detailedStatuses);
      }
    }

    // 総件数取得用のクエリ（limit 無し、head:true）
    let countQuery = supabase
      .from("attendances")
      .select(`id, payments!inner ( id )`, { count: "exact", head: true })
      .eq("event_id", validatedEventId)
      .eq("payments.method", "cash")
      .limit(1, { foreignTable: "payments" });

    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      countQuery = countQuery.or(`nickname.ilike.${pattern},email.ilike.${pattern}`);
    }
    if (filters?.attendanceStatus) {
      countQuery = countQuery.eq("status", filters.attendanceStatus);
    }
    if (filters?.paymentStatus) {
      const detailedStatuses = getPaymentStatusesFromSimple(
        filters.paymentStatus as SimplePaymentStatus
      );

      if (detailedStatuses.length === 1) {
        countQuery = countQuery.eq("payments.status", detailedStatuses[0]);
      } else {
        countQuery = countQuery.in("payments.status", detailedStatuses);
      }
    }

    // 上限 + 1 で取得
    query = query.limit(max + 1);

    const { data, error } = await query;
    // 総件数を取得（head:true で行データは取得しない）
    const { count: matchedTotal, error: countError } = await countQuery;
    if (error) {
      handleDatabaseError(error, { eventId: validatedEventId, userId: user.id });
    }
    if (countError) {
      handleDatabaseError(countError, { eventId: validatedEventId, userId: user.id });
    }

    const attendances = ((data as unknown) || []) as Array<{
      id: string;
      payments: Array<{ id: string; method: string }> | null;
    }>;

    const paymentIds = attendances
      .map((a) => a.payments?.[0]?.id ?? null)
      .filter((id): id is string => Boolean(id));

    const truncated = paymentIds.length > max;
    const resultIds = truncated ? paymentIds.slice(0, max) : paymentIds;

    // 監査ログ記録（新system_logsスキーマ対応 - service role経由）
    await logPayment({
      action: "cash_payment_ids.collect",
      message: `Collected ${resultIds.length} cash payment IDs${truncated ? " (truncated)" : ""}`,
      user_id: user.id,
      outcome: "success",
      metadata: {
        event_id: validatedEventId,
        requested_max: max,
        returned_count: resultIds.length,
        truncated,
        filters: filters || {},
      },
    });

    logger.info("Collected cash payment ids", {
      eventId: validatedEventId,
      userId: user.id,
      count: resultIds.length,
      truncated,
    });

    return {
      success: true,
      paymentIds: resultIds,
      total: paymentIds.length,
      matchedTotal: matchedTotal ?? paymentIds.length,
      truncated,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "取得に失敗しました" };
  }
}
