const mockGetCurrentUserForServerAction = jest.fn();
const mockResolveCurrentCommunityForServerAction = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: mockGetCurrentUserForServerAction,
}));

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerAction: mockResolveCurrentCommunityForServerAction,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
}));

type DashboardActionsModule = typeof import("@features/events/actions/get-dashboard-stats");

async function loadDashboardActionsModule(): Promise<DashboardActionsModule> {
  jest.resetModules();
  jest.unmock("@features/events/actions/get-dashboard-stats");

  let loadedModule: DashboardActionsModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@features/events/actions/get-dashboard-stats");
  });

  if (!loadedModule) {
    throw new Error("Failed to load get-dashboard-stats module");
  }

  return loadedModule;
}

describe("features/events/actions/get-dashboard-stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未認証時の getDashboardStatsAction は UNAUTHORIZED を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue(null);

    const { getDashboardStatsAction } = await loadDashboardActionsModule();

    await expect(getDashboardStatsAction()).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "UNAUTHORIZED",
        }),
      })
    );

    expect(mockResolveCurrentCommunityForServerAction).not.toHaveBeenCalled();
    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("current community 未選択なら getDashboardStatsAction は 0 埋めで返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      currentCommunity: null,
    });

    const { getDashboardStatsAction } = await loadDashboardActionsModule();

    await expect(getDashboardStatsAction()).resolves.toEqual({
      success: true,
      data: {
        upcomingEventsCount: 0,
        totalUpcomingParticipants: 0,
        unpaidFeesTotal: 0,
        stripeAccountBalance: 0,
      },
      message: undefined,
      redirectUrl: undefined,
      needsVerification: undefined,
    });

    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("current community 未選択なら getRecentEventsAction は空配列を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      currentCommunity: null,
    });

    const { getRecentEventsAction } = await loadDashboardActionsModule();

    await expect(getRecentEventsAction()).resolves.toEqual({
      success: true,
      data: [],
      message: undefined,
      redirectUrl: undefined,
      needsVerification: undefined,
    });

    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("getDashboardStatsAction は current community を RPC に渡す", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          upcoming_events_count: 4,
          total_upcoming_participants: 23,
          unpaid_fees_total: 9000,
        },
      ],
      error: null,
    });

    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      currentCommunity: {
        id: "community-1",
      },
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue({ rpc });

    const { getDashboardStatsAction } = await loadDashboardActionsModule();
    const result = await getDashboardStatsAction();

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          upcomingEventsCount: 4,
          totalUpcomingParticipants: 23,
          unpaidFeesTotal: 9000,
        }),
      })
    );
    expect(rpc).toHaveBeenCalledWith("get_dashboard_stats", {
      p_community_id: "community-1",
    });
  });

  it("getRecentEventsAction は current community を RPC に渡す", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          id: "event-1",
          title: "交流会",
          date: "2099-03-07T10:00:00.000Z",
          fee: 1500,
          capacity: 20,
          canceled_at: null,
          location: "Tokyo",
          attendances_count: 12,
        },
      ],
      error: null,
    });

    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      currentCommunity: {
        id: "community-2",
      },
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue({ rpc });

    const { getRecentEventsAction } = await loadDashboardActionsModule();
    const result = await getRecentEventsAction();

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: [
          expect.objectContaining({
            id: "event-1",
            status: "upcoming",
            attendances_count: 12,
          }),
        ],
      })
    );
    expect(rpc).toHaveBeenCalledWith("get_recent_events", {
      p_community_id: "community-2",
    });
  });
});
