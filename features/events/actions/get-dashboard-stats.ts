import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { resolveCurrentCommunityForServerAction } from "@core/community/current-community";
import {
  fail,
  ok,
  toActionResultFromAppResult,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import type { EventRow } from "@core/types/event";
import type { AppSupabaseClient } from "@core/types/supabase";
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
  status: "upcoming" | "ongoing" | "past" | "canceled";
  fee: number;
  attendances_count: number;
  capacity: number | null;
  location: string | null;
}

type EventForRecent = Pick<
  EventRow,
  "id" | "title" | "date" | "fee" | "capacity" | "canceled_at" | "location"
> & {
  attendances_count: number;
};

/**
 * ダッシュボード統計情報を取得する（RPC版）
 */
export async function fetchDashboardStats(
  supabase: AppSupabaseClient,
  communityId: string
): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    p_community_id: communityId,
  });

  if (error) {
    throw error;
  }

  const statsRow = data?.[0] || {
    upcoming_events_count: 0,
    total_upcoming_participants: 0,
    unpaid_fees_total: 0,
  };

  return {
    upcomingEventsCount: statsRow.upcoming_events_count,
    totalUpcomingParticipants: statsRow.total_upcoming_participants,
    unpaidFeesTotal: Number(statsRow.unpaid_fees_total),
    stripeAccountBalance: 0, // Stripe fetch is handled separately
  };
}

export async function getDashboardStatsAction(): Promise<ActionResult<DashboardStats>> {
  try {
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const currentCommunityResolutionResult = await resolveCurrentCommunityForServerAction();

    if (!currentCommunityResolutionResult.success) {
      return toActionResultFromAppResult(currentCommunityResolutionResult, {
        userMessage: "ダッシュボード統計の取得に失敗しました",
      });
    }

    if (!currentCommunityResolutionResult.data) {
      return fail("INTERNAL_ERROR", { userMessage: "ダッシュボード統計の取得に失敗しました" });
    }

    const currentCommunityResolution = currentCommunityResolutionResult.data;

    if (!currentCommunityResolution.currentCommunity) {
      return ok({
        upcomingEventsCount: 0,
        totalUpcomingParticipants: 0,
        unpaidFeesTotal: 0,
        stripeAccountBalance: 0,
      });
    }

    const supabase = await createServerActionSupabaseClient();
    return ok(await fetchDashboardStats(supabase, currentCommunityResolution.currentCommunity.id));
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
export async function fetchRecentEvents(
  supabase: AppSupabaseClient,
  communityId: string
): Promise<RecentEvent[]> {
  const { data, error } = await supabase.rpc("get_recent_events", {
    p_community_id: communityId,
  });

  if (error) {
    throw error;
  }

  return ((data as EventForRecent[] | null) || []).map((event) => {
    return {
      id: event.id,
      title: event.title,
      date: event.date,
      status: deriveEventStatus(event.date, event.canceled_at),
      fee: event.fee,
      attendances_count: Number(event.attendances_count),
      capacity: event.capacity,
      location: event.location,
    };
  });
}

export async function getRecentEventsAction(): Promise<ActionResult<RecentEvent[]>> {
  try {
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const currentCommunityResolutionResult = await resolveCurrentCommunityForServerAction();

    if (!currentCommunityResolutionResult.success) {
      return toActionResultFromAppResult(currentCommunityResolutionResult, {
        userMessage: "最近のイベント取得に失敗しました",
      });
    }

    if (!currentCommunityResolutionResult.data) {
      return fail("INTERNAL_ERROR", { userMessage: "最近のイベント取得に失敗しました" });
    }

    const currentCommunityResolution = currentCommunityResolutionResult.data;

    if (!currentCommunityResolution.currentCommunity) {
      return ok([]);
    }

    const supabase = await createServerActionSupabaseClient();
    return ok(await fetchRecentEvents(supabase, currentCommunityResolution.currentCommunity.id));
  } catch (error) {
    return fail("INTERNAL_ERROR", {
      userMessage: "最近のイベント取得に失敗しました",
      retryable: true,
      details: { originalError: error },
    });
  }
}
