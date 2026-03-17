const mockGetCurrentUserForServerAction = jest.fn();
const mockResolveCurrentCommunityForServerAction = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();
const mockListEventsForCommunity = jest.fn();

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: mockGetCurrentUserForServerAction,
}));

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerAction: mockResolveCurrentCommunityForServerAction,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
}));

jest.mock("@features/events/services/list-events", () => ({
  listEventsForCommunity: mockListEventsForCommunity,
}));

type GetEventsModule = typeof import("@features/events/actions/get-events");

async function loadGetEventsModule(): Promise<GetEventsModule> {
  jest.resetModules();
  jest.unmock("@features/events/actions/get-events");

  let loadedModule: GetEventsModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@features/events/actions/get-events");
  });

  if (!loadedModule) {
    throw new Error("Failed to load get-events module");
  }

  return loadedModule;
}

describe("features/events/actions/get-events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未認証なら UNAUTHORIZED を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue(null);

    const { getEventsAction } = await loadGetEventsModule();

    await expect(getEventsAction()).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "UNAUTHORIZED",
        }),
      })
    );

    expect(mockResolveCurrentCommunityForServerAction).not.toHaveBeenCalled();
    expect(mockListEventsForCommunity).not.toHaveBeenCalled();
  });

  it("current community 未選択なら空一覧を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      currentCommunity: null,
    });

    const { getEventsAction } = await loadGetEventsModule();

    await expect(getEventsAction()).resolves.toEqual({
      success: true,
      data: {
        items: [],
        totalCount: 0,
        hasMore: false,
      },
      message: undefined,
      redirectUrl: undefined,
      needsVerification: undefined,
    });

    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(mockListEventsForCommunity).not.toHaveBeenCalled();
  });

  it("current community を helper に渡して ActionResult へ投影する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue({
      currentCommunity: {
        id: "community-9",
      },
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockListEventsForCommunity.mockResolvedValue({
      success: true,
      data: {
        items: [{ id: "event-1", title: "交流会" }],
        totalCount: 1,
        hasMore: false,
      },
    });

    const { getEventsAction } = await loadGetEventsModule();
    const result = await getEventsAction({ limit: 12 });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          totalCount: 1,
        }),
      })
    );
    expect(mockListEventsForCommunity).toHaveBeenCalledWith(supabase, "community-9", {
      limit: 12,
    });
  });
});
