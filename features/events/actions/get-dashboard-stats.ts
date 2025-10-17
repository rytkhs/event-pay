"use server";

import { getCurrentUser } from "@core/auth/auth-utils";
import { createClient } from "@core/supabase/server";
import { createServerActionError, type ServerActionResult } from "@core/types/server-actions";
import { deriveEventStatus } from "@core/utils/derive-event-status";

// import { getStripeBalanceAction } from "@features/stripe-connect/actions/get-balance";

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

export async function getDashboardDataAction(): Promise<ServerActionResult<DashboardData>> {
  try {
    // 認証確認
    const user = await getCurrentUser();

    if (!user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    const supabase = createClient();
    const now = new Date();

    // ユーザーのイベント一覧取得
    const eventsResult = await supabase
      .from("events")
      .select(
        `
        id,
        title,
        date,
        fee,
        capacity,
        payment_deadline,
        registration_deadline,
        created_at,
        canceled_at
      `
      )
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (eventsResult.error) {
      return createServerActionError("DATABASE_ERROR", "イベント情報の取得に失敗しました", {
        retryable: true,
        details: { dbError: eventsResult.error },
      });
    }

    const events = eventsResult.data || [];

    // 開催予定のイベントをフィルタリング
    const upcomingEvents = events.filter((event: any) => {
      const eventDate = new Date(event.date);
      const isNotCanceled = !event.canceled_at;
      const isFuture = eventDate > now;
      return isNotCanceled && isFuture;
    });

    // ① 開催予定イベント数
    const upcomingEventsCount = upcomingEvents.length;

    // ② 参加予定者総数を計算
    let totalUpcomingParticipants = 0;
    for (const event of upcomingEvents) {
      const { data: attendances } = await supabase
        .from("attendances")
        .select("status")
        .eq("event_id", event.id);

      const attendingCount =
        attendances?.filter((attendance: any) => attendance.status === "attending").length || 0;
      totalUpcomingParticipants += attendingCount;
    }

    // ③ 未回収の参加費合計を計算
    let unpaidFeesTotal = 0;
    for (const event of upcomingEvents) {
      if (event.fee > 0) {
        // LEFT JOINでpaymentsを取得（決済レコードがない参加者も含める）
        const { data: attendances } = await supabase
          .from("attendances")
          .select(
            `
            id,
            status,
            payments(status)
          `
          )
          .eq("event_id", event.id)
          .eq("status", "attending");

        if (attendances) {
          for (const attendance of attendances) {
            // 支払いが未完了の参加者の参加費を合算
            // paymentsが空配列またはnullの場合も未払いとして扱う
            const hasCompletedPayment =
              attendance.payments &&
              attendance.payments.length > 0 &&
              attendance.payments.some((payment: any) =>
                ["paid", "received"].includes(payment.status)
              );

            if (!hasCompletedPayment) {
              unpaidFeesTotal += event.fee;
            }
          }
        }
      }
    }

    // ④ Stripeアカウント残高（一時的に0に設定、後でダッシュボードで取得）
    const stripeAccountBalance = 0;

    // 最近のイベント5件（参加者数を含む）
    const recentEventsWithStats = await Promise.all(
      events.slice(0, 5).map(async (event: any) => {
        const { data: attendances } = await supabase
          .from("attendances")
          .select("status")
          .eq("event_id", event.id);

        const attendances_count =
          attendances?.filter((attendance: any) => attendance.status === "attending").length || 0;

        const computedStatus = deriveEventStatus(event.date, (event as any).canceled_at ?? null);

        return {
          id: event.id,
          title: event.title,
          date: event.date,
          status: computedStatus,
          fee: event.fee,
          attendances_count,
          capacity: event.capacity,
        };
      })
    );

    return {
      success: true,
      data: {
        stats: {
          upcomingEventsCount,
          totalUpcomingParticipants,
          unpaidFeesTotal,
          stripeAccountBalance,
        },
        recentEvents: recentEventsWithStats,
      },
    };
  } catch (error) {
    return createServerActionError("INTERNAL_ERROR", "ダッシュボード情報の取得に失敗しました", {
      retryable: true,
      details: { originalError: error },
    });
  }
}
