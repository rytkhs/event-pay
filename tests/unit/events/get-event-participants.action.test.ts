import { jest } from "@jest/globals";

type ParticipantRow = {
  id: string;
  nickname: string;
  email: string;
  status: "attending" | "not_attending" | "maybe";
  created_at: string;
  updated_at: string;
  payments: Array<{
    id: string;
    method: "stripe" | "cash";
    status: "pending" | "paid" | "failed" | "received" | "refunded" | "waived" | "canceled";
    amount: number;
    paid_at: string | null;
    version: number;
    created_at: string;
    updated_at: string;
  }> | null;
};

type EventParticipantsActionDeps = {
  accessEvent?: Record<string, unknown> | null;
  eventError?: { code?: string; message?: string } | null;
  attendances?: ParticipantRow[] | null;
  attendancesError?: { message?: string } | null;
  user?: { id: string } | null;
};

const loggerInfo = jest.fn();
const handleServerError = jest.fn();

function createMockSupabase({
  accessEvent = {
    id: "00000000-0000-0000-0000-000000000001",
    community_id: "00000000-0000-0000-0000-000000000111",
  },
  eventError = null,
  attendances = [
    {
      id: "attendance-1",
      nickname: "Alice",
      email: "alice@example.com",
      status: "attending" as const,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      payments: [
        {
          id: "payment-1",
          method: "cash" as const,
          status: "received" as const,
          amount: 5000,
          paid_at: "2026-01-03T00:00:00.000Z",
          version: 1,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-03T00:00:00.000Z",
        },
      ],
    },
  ],
  attendancesError = null,
  user = { id: "00000000-0000-0000-0000-000000000999" },
}: EventParticipantsActionDeps) {
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
    order: jest.fn(),
    limit: jest.fn(),
  } as any;
  attendancesQuery.select.mockReturnValue(attendancesQuery);
  attendancesQuery.eq.mockReturnValue(attendancesQuery);
  attendancesQuery.order.mockReturnValue(attendancesQuery);
  attendancesQuery.limit.mockReturnValue(attendancesQuery);

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

describe("getEventParticipantsAction", () => {
  beforeEach(() => {
    jest.resetModules();
    loggerInfo.mockReset();
    handleServerError.mockReset();
  });

  it("current community 一致時は参加者一覧を返す", async () => {
    const mockSupabase = createMockSupabase({});

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));
    jest.doMock("@core/logging/app-logger", () => ({
      logger: { info: loggerInfo },
    }));
    jest.doMock("@core/utils/error-handler.server", () => ({
      handleServerError,
    }));

    const { getEventParticipantsAction } =
      await import("@/features/events/actions/get-event-participants");
    const result = await getEventParticipantsAction({
      eventId: "00000000-0000-0000-0000-000000000001",
      currentCommunityId: "00000000-0000-0000-0000-000000000111",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.participants).toHaveLength(1);
    expect(result.data.participants[0]?.payment_status).toBe("received");
    expect(loggerInfo).toHaveBeenCalled();
  });

  it("current community 不一致は EVENT_ACCESS_DENIED を返す", async () => {
    const mockSupabase = createMockSupabase({
      accessEvent: {
        id: "00000000-0000-0000-0000-000000000001",
        community_id: "00000000-0000-0000-0000-000000000222",
      },
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));
    jest.doMock("@core/logging/app-logger", () => ({
      logger: { info: loggerInfo },
    }));
    jest.doMock("@core/utils/error-handler.server", () => ({
      handleServerError,
    }));

    const { getEventParticipantsAction } =
      await import("@/features/events/actions/get-event-participants");
    const result = await getEventParticipantsAction({
      eventId: "00000000-0000-0000-0000-000000000001",
      currentCommunityId: "00000000-0000-0000-0000-000000000111",
    });

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
    jest.doMock("@core/logging/app-logger", () => ({
      logger: { info: loggerInfo },
    }));
    jest.doMock("@core/utils/error-handler.server", () => ({
      handleServerError,
    }));

    const { getEventParticipantsAction } =
      await import("@/features/events/actions/get-event-participants");
    const result = await getEventParticipantsAction({
      eventId: "00000000-0000-0000-0000-000000000001",
      currentCommunityId: "00000000-0000-0000-0000-000000000111",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("不正 params は VALIDATION_ERROR を返す", async () => {
    const mockSupabase = createMockSupabase({});

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));
    jest.doMock("@core/logging/app-logger", () => ({
      logger: { info: loggerInfo },
    }));
    jest.doMock("@core/utils/error-handler.server", () => ({
      handleServerError,
    }));

    const { getEventParticipantsAction } =
      await import("@/features/events/actions/get-event-participants");
    const result = await getEventParticipantsAction({
      eventId: "invalid-id",
      currentCommunityId: "still-invalid",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("参加者取得エラーは DATABASE_ERROR を返す", async () => {
    const mockSupabase = createMockSupabase({
      attendancesError: { message: "query failed" },
    });

    jest.doMock("@core/supabase/factory", () => ({
      createServerComponentSupabaseClient: () => mockSupabase,
    }));
    jest.doMock("@core/logging/app-logger", () => ({
      logger: { info: loggerInfo },
    }));
    jest.doMock("@core/utils/error-handler.server", () => ({
      handleServerError,
    }));

    const { getEventParticipantsAction } =
      await import("@/features/events/actions/get-event-participants");
    const result = await getEventParticipantsAction({
      eventId: "00000000-0000-0000-0000-000000000001",
      currentCommunityId: "00000000-0000-0000-0000-000000000111",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DATABASE_ERROR");
  });
});
