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

type EventForRecent = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "id" | "title" | "date" | "fee" | "capacity" | "canceled_at"
> & {
  attendances: Pick<Database["public"]["Tables"]["attendances"]["Row"], "status">[];
};

/**
 * ダッシュボード統計情報を取得する（RPC版）
 */
export async function getDashboardStatsAction(): Promise<ServerActionResult<DashboardStats>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    const supabase = createClient();

    // RPCを呼び出して統計を取得
    // get_dashboard_stats returns setof record, so we expect an array
    const { data, error } = await supabase.rpc("get_dashboard_stats");

    if (error) {
      throw error;
    }

    const statsRow = data?.[0] || {
      upcoming_events_count: 0,
      total_upcoming_participants: 0,
      unpaid_fees_total: 0,
    };

    return {
      success: true,
      data: {
        upcomingEventsCount: statsRow.upcoming_events_count,
        totalUpcomingParticipants: statsRow.total_upcoming_participants,
        unpaidFeesTotal: Number(statsRow.unpaid_fees_total),
        stripeAccountBalance: 0, // Stripe fetch is handled separately
      },
    };
  } catch (error) {
    return createServerActionError("INTERNAL_ERROR", "ダッシュボード統計の取得に失敗しました", {
      retryable: true,
      details: { originalError: error },
    });
  }
}

/**
 * 最近のイベントを取得する
 */
export async function getRecentEventsAction(): Promise<ServerActionResult<RecentEvent[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です");
    }

    const supabase = createClient();

    // 最近のイベント（リスト表示用）- 上位5件
    const { data: recentEventsRaw, error } = await supabase
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
      .order("date", { ascending: false })
      .limit(5)
      .overrideTypes<EventForRecent[], { merge: false }>();

    if (error) {
      throw error;
    }

    const recentEvents: RecentEvent[] = (recentEventsRaw || []).map((event) => {
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
      data: recentEvents,
    };
  } catch (error) {
    return createServerActionError("INTERNAL_ERROR", "最近のイベント取得に失敗しました", {
      retryable: true,
      details: { originalError: error },
    });
  }
}
