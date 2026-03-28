import { jest } from "@jest/globals";

type EventDetailActionDeps = {
  accessEvent?: Record<string, unknown> | null;
  detailEvent?: Record<string, unknown> | null;
  eventError?: { code?: string; message?: string } | null;
  attendancesCount?: number | null;
  attendancesError?: { message?: string } | null;
  creatorName?: string | null;
  creatorError?: { code?: string; message?: string } | null;
  user?: { id: string } | null;
};

function createMockSupabase({
  accessEvent = {
    id: "00000000-0000-0000-0000-000000000001",
    community_id: "community-1",
    created_by: "00000000-0000-0000-0000-000000000999",
  },
  detailEvent = {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Test Event",
    date: "2099-01-01T10:00:00.000Z",
    location: "Tokyo",
    fee: 5000,
    capacity: 30,
    description: "desc",
    registration_deadline: "2098-12-25T10:00:00.000Z",
    payment_deadline: "2098-12-28T10:00:00.000Z",
    payment_methods: ["cash"],
    allow_payment_after_deadline: false,
    grace_period_days: 0,
    created_at: "2098-10-01T10:00:00.000Z",
    updated_at: "2098-10-01T10:00:00.000Z",
    created_by: "00000000-0000-0000-0000-000000000999",
    community_id: "community-1",
    invite_token: "invite-token",
    canceled_at: null,
  },
  eventError = null,
  attendancesCount = 0,
  attendancesError = null,
  creatorName = "Tester",
  creatorError = null,
  user = { id: "00000000-0000-0000-0000-000000000999" },
}: EventDetailActionDeps) {
  const maybeSingle = jest
    .fn()
    .mockResolvedValueOnce({
      data: accessEvent,
      error: eventError,
    })
    .mockResolvedValueOnce({
      data: detailEvent,
      error: eventError,
    });

  const eventsQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle,
  } as any;
  eventsQuery.select.mockReturnValue(eventsQuery);
  eventsQuery.eq.mockReturnValue(eventsQuery);

  const attendancesResult = {
    count: attendancesCount,
    error: attendancesError,
  };
  const attendancesQuery = {
    select: jest.fn(),
    eq: jest.fn(),
  } as any;
  attendancesQuery.select.mockReturnValue(attendancesQuery);
  attendancesQuery.eq.mockImplementation(() => {
    if (attendancesQuery.eq.mock.calls.length >= 2) {
      return Promise.resolve(attendancesResult);
    }
    return attendancesQuery;
  });

  return {
    auth: {
      getUser: jest.fn<() => Promise<any>>().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === "events") return eventsQuery;
      if (table === "attendances") return attendancesQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: jest.fn<() => Promise<any>>().mockResolvedValue({
      data: creatorName,
      error: creatorError,
    }),
  };
}

describe("getEventDetailAction", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("current community 一致時は必須項目と参加者数を含む詳細を返す", async () => {
    const mockSupabase = createMockSupabase({
      attendancesCount: 3,
      creatorName: "Organizer",
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventDetailAction } = await import("@/features/events/actions/get-event-detail");
    const result = await getEventDetailAction(
      "00000000-0000-0000-0000-000000000001",
      "community-1"
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allow_payment_after_deadline).toBe(false);
    expect(result.data.grace_period_days).toBe(0);
    expect(result.data.attendances_count).toBe(3);
    expect(result.data.community_id).toBe("community-1");
  });

  it("current community 不一致は EVENT_ACCESS_DENIED を返す", async () => {
    const mockSupabase = createMockSupabase({
      accessEvent: {
        id: "00000000-0000-0000-0000-000000000001",
        community_id: "community-2",
        created_by: "00000000-0000-0000-0000-000000000999",
      },
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventDetailAction } = await import("@/features/events/actions/get-event-detail");
    const result = await getEventDetailAction(
      "00000000-0000-0000-0000-000000000001",
      "community-1"
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("EVENT_ACCESS_DENIED");
  });

  it("イベントが存在しない場合は EVENT_NOT_FOUND を返す", async () => {
    const mockSupabase = createMockSupabase({
      accessEvent: null,
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventDetailAction } = await import("@/features/events/actions/get-event-detail");
    const result = await getEventDetailAction(
      "00000000-0000-0000-0000-000000000001",
      "community-1"
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("EVENT_NOT_FOUND");
  });

  it("未認証時は UNAUTHORIZED を返す", async () => {
    const mockSupabase = createMockSupabase({
      user: null,
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventDetailAction } = await import("@/features/events/actions/get-event-detail");
    const result = await getEventDetailAction(
      "00000000-0000-0000-0000-000000000001",
      "community-1"
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("参加者数集計に失敗した場合は DATABASE_ERROR を返す", async () => {
    const mockSupabase = createMockSupabase({
      attendancesError: { message: "count failed" },
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));

    const { getEventDetailAction } = await import("@/features/events/actions/get-event-detail");
    const result = await getEventDetailAction(
      "00000000-0000-0000-0000-000000000001",
      "community-1"
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
  });
});
