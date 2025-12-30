"use server";

import { verifyEventAccess, handleDatabaseError } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import {
  GetParticipantsParamsSchema,
  type GetParticipantsResponse,
  type ParticipantView,
} from "@core/validation/participant-management";

/**
 * イベント参加者全件取得
 * MANAGE-001: 参加者一覧表示
 *
 * attendancesとpaymentsを結合して完全な参加者情報を全件取得
 * フィルタリング・ソート・ページネーションはクライアントサイドで処理
 */
export async function getEventParticipantsAction(
  params: unknown
): Promise<GetParticipantsResponse> {
  try {
    // パラメータバリデーション（eventIdのみ）
    const validatedParams = GetParticipantsParamsSchema.parse(params);
    const { eventId } = validatedParams;

    // 共通の認証・権限確認処理
    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    const supabase = createClient();

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
        updated_at
      )`;

    const { data: attendances, error } = await supabase
      .from("attendances")
      .select(selectColumns)
      .eq("event_id", validatedEventId)
      // 最新決済を取得: paid_at DESC NULLS LAST, created_at DESC, updated_at DESC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("paid_at", {
        foreignTable: "payments",
        ascending: false,
        nullsFirst: false,
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("created_at", { foreignTable: "payments", ascending: false } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("updated_at", { foreignTable: "payments", ascending: false } as any)
      .limit(1, { foreignTable: "payments" })
      // デフォルトソート: 作成日時降順
      .order("created_at", { ascending: false });

    if (error) {
      handleDatabaseError(error, { eventId: validatedEventId, userId: user.id });
    }

    // 実際のSupabaseクエリ結果に合わせた型定義
    type SupabaseAttendanceWithPayments = {
      id: string;
      nickname: string;
      email: string;
      status: "attending" | "not_attending" | "maybe";
      created_at: string;
      updated_at: string;
      payments: Array<{
        id: string;
        method: "stripe" | "cash";
        status: "pending" | "paid" | "failed" | "received" | "refunded" | "waived" | "canceled";
        amount: number;
        paid_at: string | null;
        version: number;
        created_at: string;
        updated_at: string;
      }> | null;
    };

    // データ変換（参加者ビュー形式に変換）
    const participants: ParticipantView[] = (
      (attendances as unknown as SupabaseAttendanceWithPayments[]) || []
    ).map((attendance) => {
      const latestPayment = (attendance.payments || [])[0] || null;

      return {
        attendance_id: attendance.id,
        nickname: attendance.nickname,
        email: attendance.email,
        status: attendance.status,
        attendance_created_at: attendance.created_at,
        attendance_updated_at: attendance.updated_at,
        payment_id: latestPayment?.id || null,
        payment_method: latestPayment?.method || null,
        payment_status: latestPayment?.status || null,
        amount: latestPayment?.amount || null,
        paid_at: latestPayment?.paid_at || null,
        payment_version: latestPayment?.version || null,
        payment_created_at: latestPayment?.created_at || null,
        payment_updated_at: latestPayment?.updated_at || null,
      };
    });

    logger.info("Event participants retrieved (all)", {
      category: "attendance",
      action: "get_event_participants",
      actor_type: "user",
      event_id: validatedEventId,
      user_id: user.id,
      participant_count: participants.length,
      outcome: "success",
    });

    return { participants };
  } catch (error) {
    logger.error("Failed to get event participants", {
      category: "attendance",
      action: "get_event_participants",
      actor_type: "user",
      error_message: error instanceof Error ? error.message : "Unknown error",
      params: JSON.stringify(params),
      outcome: "failure",
    });

    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to get event participants");
  }
}
