"use server";

import { getCurrentUser } from "@core/auth/auth-utils";
import { createClient } from "@core/supabase/server";
import { createServerActionError, type ServerActionResult } from "@core/types/server-actions";
import { deriveEventStatus } from "@core/utils/derive-event-status";

import type { Database } from "@/types/database";

export interface DashboardStats {
  upcomingEventsCount: number;
  totalUpcomingParticipants: number;
  unpaidFeesTotal: number;
  stripeAccountBalance: number;
}

export interface RecentEvent {
  id: string;
  title: string;
  date: string;
  status: string;
  fee: number;
  attendances_count: number;
  capacity: number | null;
}

export interface DashboardData {
  stats: DashboardStats;
  recentEvents: RecentEvent[];
}

type AttendanceWithPayments = Database["public"]["Tables"]["attendances"]["Row"] & {
  payments: Database["public"]["Tables"]["payments"]["Row"][];
};

type EventForStats = Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "fee"> & {
  attendances: AttendanceWithPayments[];
};

type EventForRecent = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "id" | "title" | "date" | "fee" | "capacity" | "canceled_at"
> & {
  attendances: Pick<Database["public"]["Tables"]["attendances"]["Row"], "status">[];
};

export async function getDashboardDataAction(): Promise<ServerActionResult<DashboardData>> {
  try {
    // 認証確認
    const user = await getCurrentUser();

    if (!user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    const supabase = createClient();
    const nowIso = new Date().toISOString();

    // 並行して実行するクエリ:
    // 1. 開催予定のイベント（統計計算用）- 必要なフィールドのみ取得
    // 注: データベースの日時比較はUTCで行うため、JavaScriptのISO文字列を使用します
    const upcomingEventsPromise = supabase
      .from("events")
      .select(
        `
        id,
        fee,
        attendances (
          status,
          payments (status)
        )
      `
      )
      .eq("created_by", user.id)
      .gt("date", nowIso)
      .is("canceled_at", null)
      .overrideTypes<EventForStats[], { merge: false }>();

    // 2. 最近のイベント（リスト表示用）- 上位5件
    const recentEventsPromise = supabase
      .from("events")
      .select(
        `
        id,
        title,
        date,
        fee,
        capacity,
        canceled_at,
        attendances (status)
      `
      )
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .overrideTypes<EventForRecent[], { merge: false }>();

    // Promise.allで並列実行
    const [upcomingResult, recentResult] = await Promise.all([
      upcomingEventsPromise,
      recentEventsPromise,
    ]);

    if (upcomingResult.error) {
      throw upcomingResult.error;
    }
    if (recentResult.error) {
      throw recentResult.error;
    }

    const upcomingEvents = upcomingResult.data || [];
    const recentEventsRaw = recentResult.data || [];

    // ① 開催予定イベント数
    const upcomingEventsCount = upcomingEvents.length;

    // ② 参加予定者総数 & ③ 未回収の参加費合計
    let totalUpcomingParticipants = 0;
    let unpaidFeesTotal = 0;

    for (const event of upcomingEvents) {
      // 参加ステータスが "attending" の人のみを対象
      const attendingParticipants =
        event.attendances?.filter((a) => a.status === "attending") || [];

      totalUpcomingParticipants += attendingParticipants.length;

      // 未回収の計算（有料イベントのみ）
      if (event.fee > 0) {
        for (const attendance of attendingParticipants) {
          // 支払いが完了しているかチェック
          // paymentsが含まれない、または空、またはステータスがpaid/receivedのものがない
          const payments = attendance.payments || [];
          const hasCompletedPayment = payments.some((p) => ["paid", "received"].includes(p.status));

          if (!hasCompletedPayment) {
            unpaidFeesTotal += event.fee;
          }
        }
      }
    }

    // ④ Stripeアカウント残高（一時的に0に設定、後でダッシュボードで取得）
    const stripeAccountBalance = 0;

    // 最近のイベントフォーマット
    const recentEvents: RecentEvent[] = recentEventsRaw.map((event) => {
      const attendances = event.attendances || [];
      const attendances_count = attendances.filter((a) => a.status === "attending").length;

      return {
        id: event.id,
        title: event.title,
        date: event.date,
        status: deriveEventStatus(event.date, event.canceled_at),
        fee: event.fee,
        attendances_count,
        capacity: event.capacity,
      };
    });

    return {
      success: true,
      data: {
        stats: {
          upcomingEventsCount,
          totalUpcomingParticipants,
          unpaidFeesTotal,
          stripeAccountBalance,
        },
        recentEvents,
      },
    };
  } catch (error) {
    return createServerActionError("INTERNAL_ERROR", "ダッシュボード情報の取得に失敗しました", {
      retryable: true,
      details: { originalError: error },
    });
  }
}
