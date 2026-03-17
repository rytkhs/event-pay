import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import {
  fetchDashboardStats,
  fetchRecentEvents,
  type DashboardStats,
  type RecentEvent,
} from "@features/events/server";
import {
  getDashboardConnectBalance,
  getDashboardConnectCtaStatus,
  type DetailedAccountStatus,
} from "@features/stripe-connect/server";

export type DashboardDataResource = {
  stats: Promise<DashboardStats>;
  recentEvents: Promise<RecentEvent[]>;
  stripeBalance: Promise<number | null>;
  stripeCtaStatus: Promise<DetailedAccountStatus | undefined>;
};

export async function createDashboardDataResource(
  currentCommunityId: string
): Promise<DashboardDataResource> {
  const supabase = await createServerComponentSupabaseClient();

  return {
    stats: fetchDashboardStats(supabase, currentCommunityId),
    recentEvents: fetchRecentEvents(supabase, currentCommunityId),
    stripeBalance: getDashboardConnectBalance(supabase, currentCommunityId),
    stripeCtaStatus: getDashboardConnectCtaStatus(supabase, currentCommunityId),
  };
}
