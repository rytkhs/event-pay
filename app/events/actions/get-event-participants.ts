"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyEventAccess, handleDatabaseError } from "@/lib/auth/event-authorization";
import {
  GetParticipantsParamsSchema,
  type GetParticipantsResponse,
  type ParticipantView
} from "@/lib/validation/participant-management";
import { logger } from "@/lib/logging/app-logger";

/**
 * イベント参加者詳細一覧取得
 * MANAGE-001: 参加者一覧表示（検索/フィルター/ページング/ソート）
 *
 * attendancesとpaymentsを結合して完全な参加者情報を取得
 */
export async function getEventParticipantsAction(
  params: unknown
): Promise<GetParticipantsResponse> {
  try {
    // パラメータバリデーション
    const validatedParams = GetParticipantsParamsSchema.parse(params);
    const { eventId, search, attendanceStatus, paymentMethod, paymentStatus, sortField, sortOrder, page, limit } = validatedParams;

    // 共通の認証・権限確認処理
    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    const supabase = createClient();

    // ベースクエリの構築
    let query = supabase
      .from("attendances")
      .select(`
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
        )
      `)
      .eq("event_id", validatedEventId)
      // 最新の決済 1 件に絞る
      .order("updated_at", { foreignTable: "payments", ascending: false })
      .limit(1, { foreignTable: "payments" });

    // 検索条件（ニックネーム/メール部分一致）
    if (search) {
      query = query.or(`nickname.ilike.%${search}%, email.ilike.%${search}%`);
    }

    // 参加ステータスフィルター
    if (attendanceStatus) {
      query = query.eq("status", attendanceStatus);
    }

    // ソート処理（attendances側のフィールドのみ）
    const attendanceSortFields = ["created_at", "updated_at", "nickname", "email", "status"];
    if (attendanceSortFields.includes(sortField)) {
      query = query.order(sortField, { ascending: sortOrder === "asc" });
    } else {
      // デフォルトソート
      query = query.order("updated_at", { ascending: false });
    }

    // 件数取得用クエリ（同じ条件）
    let countQuery = supabase
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", validatedEventId);

    if (search) {
      countQuery = countQuery.or(`nickname.ilike.%${search}%, email.ilike.%${search}%`);
    }

    if (attendanceStatus) {
      countQuery = countQuery.eq("status", attendanceStatus);
    }

    // ページネーション
    const offset = (page - 1) * limit;
    // paymentMethod / paymentStatus フィルタがある場合はクライアント側で再スライスするため
    // Supabase へは range を適用しない（重複適用を防ぐ）
    if (!paymentMethod && !paymentStatus) {
      query = query.range(offset, offset + limit - 1);
    }

    // 並行実行
    const [{ data: attendances, error: attendancesError }, { count, error: countError }] = await Promise.all([
      query,
      countQuery
    ]);

    if (attendancesError) {
      handleDatabaseError(attendancesError, { eventId: validatedEventId, userId: user.id });
    }

    if (countError) {
      handleDatabaseError(countError, { eventId: validatedEventId, userId: user.id });
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
        status: "pending" | "paid" | "failed" | "received" | "refunded" | "waived" | "completed";
        amount: number;
        paid_at: string | null;
        version: number;
        created_at: string;
        updated_at: string;
      }> | null;
    };

    // データ変換（参加者ビュー形式に変換）
    const participants: ParticipantView[] = (attendances as unknown as SupabaseAttendanceWithPayments[] || []).map((attendance) => {
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

    // 決済フィルタリング（Supabaseクエリでは複雑なので、後処理で実行）
    let filteredParticipants = participants;
    const hasPaymentFilter = paymentMethod || paymentStatus;

    if (paymentMethod) {
      filteredParticipants = filteredParticipants.filter(p => p.payment_method === paymentMethod);
    }

    if (paymentStatus) {
      filteredParticipants = filteredParticipants.filter(p => p.payment_status === paymentStatus);
    }

    // 決済関連のソート処理（後処理）
    const paymentSortFields = ["payment_method", "payment_status", "paid_at"];
    if (paymentSortFields.includes(sortField)) {
      filteredParticipants.sort((a, b) => {
        let aValue, bValue;

        switch (sortField) {
          case "payment_method":
            aValue = a.payment_method || "";
            bValue = b.payment_method || "";
            break;
          case "payment_status":
            aValue = a.payment_status || "";
            bValue = b.payment_status || "";
            break;
          case "paid_at":
            aValue = a.paid_at ? new Date(a.paid_at).getTime() : 0;
            bValue = b.paid_at ? new Date(b.paid_at).getTime() : 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    // 件数計算：決済フィルターがある場合はフィルター後の全件数を使用
    const totalCount = count || 0;
    const effectiveTotal = hasPaymentFilter ? filteredParticipants.length : totalCount;

    // ページネーション適用
    const startIndex = (page - 1) * limit;
    const paginatedParticipants = hasPaymentFilter
      ? filteredParticipants.slice(startIndex, startIndex + limit)
      : filteredParticipants;

    const totalPages = Math.ceil(effectiveTotal / limit);

    logger.info("Event participants retrieved", {
      eventId: validatedEventId,
      userId: user.id,
      participantCount: filteredParticipants.length,
      totalCount: effectiveTotal,
      page,
      filters: { search, attendanceStatus, paymentMethod, paymentStatus }
    });

    return {
      participants: paginatedParticipants,
      pagination: {
        page,
        limit,
        total: effectiveTotal,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        search,
        attendanceStatus,
        paymentMethod,
        paymentStatus,
      },
      sort: {
        field: sortField,
        order: sortOrder,
      },
    };

  } catch (error) {
    logger.error("Failed to get event participants", {
      error: error instanceof Error ? error.message : "Unknown error",
      params
    });

    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to get event participants");
  }
}
