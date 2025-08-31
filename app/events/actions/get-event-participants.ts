"use server";

import { createClient } from "@core/supabase/server";
import { verifyEventAccess, handleDatabaseError } from "@core/auth/event-authorization";
import {
  GetParticipantsParamsSchema,
  type GetParticipantsResponse,
  type ParticipantView
} from "@core/validation/participant-management";
import { logger } from "@core/logging/app-logger";

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
      // 最新決済を取得: 1) paid_at DESC NULLS LAST 2) created_at DESC 3) updated_at DESC
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
      .limit(1, { foreignTable: "payments" });

    // 件数取得用クエリ（同じ条件）
    let countQuery = supabase
      .from("attendances")
      .select("id, payments!left(id)", {
        count: "exact",
        head: true,
      })
      .eq("event_id", validatedEventId);
    // payments が複数行ヒットした場合に attendance が重複計上されないよう、
    // LIST 取得側と同じ lateral join (order+limit 1) を適用する。
    // PostgREST における head:true + count:exact でも JOIN 重複が残るため、
    // 同一ロジックを付与して整合性を担保する。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    countQuery = countQuery
      .order("paid_at", {
        foreignTable: "payments",
        ascending: false,
        nullsFirst: false,
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("created_at", { foreignTable: "payments", ascending: false } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("updated_at", { foreignTable: "payments", ascending: false } as any)
      .limit(1, { foreignTable: "payments" });

    // 検索条件（ニックネーム/メール部分一致）
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`nickname.ilike.${pattern},email.ilike.${pattern}`);
      countQuery = countQuery.or(`nickname.ilike.${pattern},email.ilike.${pattern}`);
    }

    // 参加ステータスフィルター
    if (attendanceStatus) {
      query = query.eq("status", attendanceStatus);
      countQuery = countQuery.eq("status", attendanceStatus);
    }

    // 決済フィルターを Supabase クエリにプッシュ
    if (paymentMethod) {
      query = query.eq("payments.method", paymentMethod);
      countQuery = countQuery.eq("payments.method", paymentMethod);
    }
    if (paymentStatus) {
      query = query.eq("payments.status", paymentStatus);
      countQuery = countQuery.eq("payments.status", paymentStatus);
    }

    // ソート処理
    const attendanceSortFields = [
      "created_at",
      "updated_at",
      "nickname",
      "email",
      "status",
    ];

    const paymentSortFields: Record<string, { column: string; foreignTable: string }> = {
      payment_method: { column: "method", foreignTable: "payments" },
      payment_status: { column: "status", foreignTable: "payments" },
      paid_at: { column: "paid_at", foreignTable: "payments" },
    };

    if (attendanceSortFields.includes(sortField)) {
      query = query.order(sortField, { ascending: sortOrder === "asc" });
    } else if (sortField in paymentSortFields) {
      const cfg = paymentSortFields[sortField];
      query = query.order(cfg.column, {
        ascending: sortOrder === "asc",
        foreignTable: cfg.foreignTable,
        nullsFirst: false, // 未決済(paid_at=null)を最後に持ってくる（NULLS LAST 固定）
      } as any);
    } else {
      // フォールバック：created_at DESC（編集による並び揺れを避ける）
      query = query.order("created_at", { ascending: false });
    }

    // ページネーション
    const offset = (page - 1) * limit;
    // Supabase へページングを任せる
    query = query.range(offset, offset + limit - 1);

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

    // 決済関連のソートは DB 側で完結するためクライアントでの並べ替えは不要

    // 件数計算：Supabase 側でフィルター済みの件数を使用
    const totalCount = count || 0;
    const effectiveTotal = totalCount;

    // ページネーションは Supabase が担当したのでそのまま返却
    const paginatedParticipants = participants;

    const totalPages = Math.ceil(effectiveTotal / limit);

    logger.info("Event participants retrieved", {
      eventId: validatedEventId,
      userId: user.id,
      participantCount: participants.length,
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
