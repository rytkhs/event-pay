import { requireCurrentUserForServerComponent } from "@core/auth/auth-utils";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import {
  fetchDashboardStats,
  fetchRecentEvents,
  type DashboardStats,
  type RecentEvent,
} from "@features/events/server";
import {
  getDashboardConnectSummary,
  type DashboardConnectSummary,
} from "@features/stripe-connect/server";

export type DashboardDataResource = {
  stats: Promise<DashboardStats>;
  recentEvents: Promise<RecentEvent[]>;
  stripeSummary: Promise<DashboardConnectSummary>;
};

export async function createDashboardDataResource(): Promise<DashboardDataResource> {
  const user = await requireCurrentUserForServerComponent();
  const supabase = await createServerComponentSupabaseClient();

  return {
    stats: fetchDashboardStats(supabase),
    recentEvents: fetchRecentEvents(supabase),
    stripeSummary: getDashboardConnectSummary(supabase, user.id),
  };
}
