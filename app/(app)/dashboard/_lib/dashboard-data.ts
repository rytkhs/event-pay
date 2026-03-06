import { requireCurrentUserForServerComponent } from "@core/auth/auth-utils";
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

export async function createDashboardDataResource(): Promise<DashboardDataResource> {
  const user = await requireCurrentUserForServerComponent();
  const supabase = await createServerComponentSupabaseClient();

  return {
    stats: fetchDashboardStats(supabase),
    recentEvents: fetchRecentEvents(supabase),
    stripeBalance: getDashboardConnectBalance(supabase, user.id),
    stripeCtaStatus: getDashboardConnectCtaStatus(supabase, user.id),
  };
}
