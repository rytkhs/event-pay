const requireCurrentUserForServerComponent = jest.fn();
const createServerComponentSupabaseClient = jest.fn();
const fetchDashboardStats = jest.fn();
const fetchRecentEvents = jest.fn();
const getDashboardConnectSummary = jest.fn();

jest.mock("@core/auth/auth-utils", () => ({
  requireCurrentUserForServerComponent,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
}));

jest.mock("@features/events/server", () => ({
  fetchDashboardStats,
  fetchRecentEvents,
}));

jest.mock("@features/stripe-connect/server", () => ({
  getDashboardConnectSummary,
}));

describe("dashboard shared data loader", () => {
  beforeEach(() => {
    jest.resetModules();
    requireCurrentUserForServerComponent.mockReset();
    createServerComponentSupabaseClient.mockReset();
    fetchDashboardStats.mockReset();
    fetchRecentEvents.mockReset();
    getDashboardConnectSummary.mockReset();
  });

  it("reuses auth and supabase setup across dashboard slices", async () => {
    const supabase = { kind: "supabase-client" };
    const stats = {
      upcomingEventsCount: 3,
      totalUpcomingParticipants: 18,
      unpaidFeesTotal: 6000,
      stripeAccountBalance: 0,
    };
    const recentEvents = [
      {
        id: "event-1",
        title: "交流会",
        date: "2026-03-07T10:00:00.000Z",
        status: "upcoming" as const,
        fee: 1500,
        attendances_count: 12,
        capacity: 20,
        location: "Tokyo",
      },
    ];
    const stripeSummary = {
      balance: 2500,
      ctaStatus: undefined,
    };

    requireCurrentUserForServerComponent.mockResolvedValue({ id: "user-1" });
    createServerComponentSupabaseClient.mockResolvedValue(supabase);
    fetchDashboardStats.mockResolvedValue(stats);
    fetchRecentEvents.mockResolvedValue(recentEvents);
    getDashboardConnectSummary.mockResolvedValue(stripeSummary);

    const dashboardData = await import("@/app/(app)/dashboard/_lib/dashboard-data");
    const resource = await dashboardData.createDashboardDataResource();

    const [resolvedStats, resolvedEvents, resolvedStripe] = await Promise.all([
      resource.stats,
      resource.recentEvents,
      resource.stripeSummary,
    ]);

    expect(resolvedStats).toEqual(stats);
    expect(resolvedEvents).toEqual(recentEvents);
    expect(resolvedStripe).toEqual(stripeSummary);

    expect(requireCurrentUserForServerComponent).toHaveBeenCalledTimes(1);
    expect(createServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(fetchDashboardStats).toHaveBeenCalledTimes(1);
    expect(fetchDashboardStats).toHaveBeenCalledWith(supabase);
    expect(fetchRecentEvents).toHaveBeenCalledTimes(1);
    expect(fetchRecentEvents).toHaveBeenCalledWith(supabase);
    expect(getDashboardConnectSummary).toHaveBeenCalledTimes(1);
    expect(getDashboardConnectSummary).toHaveBeenCalledWith(supabase, "user-1");
  });
});
