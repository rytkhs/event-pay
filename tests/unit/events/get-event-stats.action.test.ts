import { jest } from "@jest/globals";

type EventStatsActionDeps = {
  accessEvent?: Record<string, unknown> | null;
  eventError?: { code?: string; message?: string } | null;
  attendances?: Array<{ status: "attending" | "maybe" | "not_attending" }> | null;
  attendancesError?: { message?: string } | null;
  user?: { id: string } | null;
};

function createMockSupabase({
  accessEvent = {
    id: "00000000-0000-0000-0000-000000000001",
    community_id: "community-1",
  },
  eventError = null,
  attendances = [{ status: "attending" }, { status: "maybe" }, { status: "attending" }],
  attendancesError = null,
  user = { id: "00000000-0000-0000-0000-000000000999" },
}: EventStatsActionDeps) {
  const maybeSingle = jest.fn(async () => ({
    data: accessEvent,
    error: eventError,
  }));

  const eventsQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle,
  } as any;
  eventsQuery.select.mockReturnValue(eventsQuery);
  eventsQuery.eq.mockReturnValue(eventsQuery);

  const attendancesQuery = {
    data: attendances,
    error: attendancesError,
    select: jest.fn(),
    eq: jest.fn(),
  } as any;
  attendancesQuery.select.mockReturnValue(attendancesQuery);
  attendancesQuery.eq.mockReturnValue(attendancesQuery);

  return {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
    from: jest.fn((table: string) => {
      if (table === "events") return eventsQuery;
      if (table === "attendances") return attendancesQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("getEventStatsAction", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("current community 一致時は統計を返す", async () => {
    const mockSupabase = createMockSupabase({});

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventStatsAction } = await import("@/features/events/actions/get-event-stats");
    const result = await getEventStatsAction("00000000-0000-0000-0000-000000000001", "community-1");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ attending_count: 2, maybe_count: 1 });
  });

  it("current community 不一致は EVENT_ACCESS_DENIED を返す", async () => {
    const mockSupabase = createMockSupabase({
      accessEvent: {
        id: "00000000-0000-0000-0000-000000000001",
        community_id: "community-2",
      },
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventStatsAction } = await import("@/features/events/actions/get-event-stats");
    const result = await getEventStatsAction("00000000-0000-0000-0000-000000000001", "community-1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("EVENT_ACCESS_DENIED");
  });

  it("未認証時は UNAUTHORIZED を返す", async () => {
    const mockSupabase = createMockSupabase({
      user: null,
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventStatsAction } = await import("@/features/events/actions/get-event-stats");
    const result = await getEventStatsAction("00000000-0000-0000-0000-000000000001", "community-1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("不正な eventId は EVENT_INVALID_ID を返す", async () => {
    const mockSupabase = createMockSupabase({});

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventStatsAction } = await import("@/features/events/actions/get-event-stats");
    const result = await getEventStatsAction("invalid-id", "community-1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("EVENT_INVALID_ID");
  });

  it("参加者取得エラーは DATABASE_ERROR を返す", async () => {
    const mockSupabase = createMockSupabase({
      attendancesError: { message: "query failed" },
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventStatsAction } = await import("@/features/events/actions/get-event-stats");
    const result = await getEventStatsAction("00000000-0000-0000-0000-000000000001", "community-1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
  });
});
