const createServerComponentSupabaseClient = jest.fn();
const fetchDashboardStats = jest.fn();
const fetchRecentEvents = jest.fn();
const getDashboardConnectBalance = jest.fn();
const getDashboardConnectCtaStatus = jest.fn();

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
}));

jest.mock("@features/events/server", () => ({
  fetchDashboardStats,
  fetchRecentEvents,
}));

jest.mock("@features/stripe-connect/server", () => ({
  getDashboardConnectBalance,
  getDashboardConnectCtaStatus,
}));

describe("dashboard shared data loader", () => {
  beforeEach(() => {
    jest.resetModules();
    createServerComponentSupabaseClient.mockReset();
    fetchDashboardStats.mockReset();
    fetchRecentEvents.mockReset();
    getDashboardConnectBalance.mockReset();
    getDashboardConnectCtaStatus.mockReset();
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
    const stripeBalance = 2500;
    const stripeCtaStatus = undefined;

    createServerComponentSupabaseClient.mockResolvedValue(supabase);
    fetchDashboardStats.mockResolvedValue(stats);
    fetchRecentEvents.mockResolvedValue(recentEvents);
    getDashboardConnectBalance.mockResolvedValue(stripeBalance);
    getDashboardConnectCtaStatus.mockResolvedValue(stripeCtaStatus);

    const dashboardData = await import("@/app/(app)/dashboard/_lib/dashboard-data");
    const resource = await dashboardData.createDashboardDataResource("user-1", "community-1");

    const [resolvedStats, resolvedEvents, resolvedStripeBalance, resolvedStripeCtaStatus] =
      await Promise.all([
        resource.stats,
        resource.recentEvents,
        resource.stripeBalance,
        resource.stripeCtaStatus,
      ]);

    expect(resolvedStats).toEqual(stats);
    expect(resolvedEvents).toEqual(recentEvents);
    expect(resolvedStripeBalance).toEqual(stripeBalance);
    expect(resolvedStripeCtaStatus).toEqual(stripeCtaStatus);

    expect(createServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(fetchDashboardStats).toHaveBeenCalledTimes(1);
    expect(fetchDashboardStats).toHaveBeenCalledWith(supabase, "community-1");
    expect(fetchRecentEvents).toHaveBeenCalledTimes(1);
    expect(fetchRecentEvents).toHaveBeenCalledWith(supabase, "community-1");
    expect(getDashboardConnectBalance).toHaveBeenCalledTimes(1);
    expect(getDashboardConnectBalance).toHaveBeenCalledWith(supabase, "user-1", "community-1");
    expect(getDashboardConnectCtaStatus).toHaveBeenCalledTimes(1);
    expect(getDashboardConnectCtaStatus).toHaveBeenCalledWith(supabase, "user-1", "community-1");
  });
});
