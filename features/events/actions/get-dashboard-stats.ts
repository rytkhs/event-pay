import { getCurrentUserForServerComponent } from "@core/auth/auth-utils";
import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import type { AttendanceRow, EventRow } from "@core/types/event";
import { deriveEventStatus } from "@core/utils/derive-event-status";

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
  location: string | null;
}

type EventForRecent = Pick<
  EventRow,
  "id" | "title" | "date" | "fee" | "capacity" | "canceled_at" | "location"
> & {
  attendances: Pick<AttendanceRow, "status">[];
};

/**
 * ダッシュボード統計情報を取得する（RPC版）
 */
export async function getDashboardStatsAction(): Promise<ActionResult<DashboardStats>> {
  try {
    const user = await getCurrentUserForServerComponent();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const supabase = await createServerComponentSupabaseClient();

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

    return ok({
      upcomingEventsCount: statsRow.upcoming_events_count,
      totalUpcomingParticipants: statsRow.total_upcoming_participants,
      unpaidFeesTotal: Number(statsRow.unpaid_fees_total),
      stripeAccountBalance: 0, // Stripe fetch is handled separately
    });
  } catch (error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "ダッシュボード統計の取得に失敗しました",
      retryable: true,
      details: { originalError: error },
    });
  }
}

/**
 * 最近のイベントを取得する
 */
export async function getRecentEventsAction(): Promise<ActionResult<RecentEvent[]>> {
  try {
    const user = await getCurrentUserForServerComponent();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const supabase = await createServerComponentSupabaseClient();

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
        location,
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
        location: event.location,
      };
    });

    return ok(recentEvents);
  } catch (error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "最近のイベント取得に失敗しました",
      retryable: true,
      details: { originalError: error },
    });
  }
}
