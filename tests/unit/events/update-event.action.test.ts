import { jest } from "@jest/globals";

// next/headers をモック
let mockHeaders: { get: (name: string) => string | null } | undefined;
jest.mock("next/headers", () => ({
  headers: jest.fn(() => mockHeaders),
}));

// next/cache をモック
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// Supabase クライアントをモック
type AnyFn = (...args: any[]) => any;

describe("updateEventAction", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockHeaders = {
      get: (name: string) => {
        const n = name.toLowerCase();
        if (n === "origin") return "http://localhost:3000";
        if (n === "referer") return "http://localhost:3000/events/evt-1/edit";
        if (n === "x-http-method-override") return "POST";
        return null;
      },
    };
  });

  function mockSupabaseWith(options: {
    existingEvent: any;
    paymentsData?: any[];
    attendancesData?: any[];
    updatedEvent?: any;
  }) {
    const captured = { updateData: undefined as any };

    const eventsQuery: any = {
      select: jest.fn(() => eventsQuery),
      eq: jest.fn(() => eventsQuery),
      // single: 1回目: 既存, 2回目: 更新後
      single: (jest.fn() as AnyFn)
        .mockResolvedValueOnce({ data: options.existingEvent, error: null })
        .mockResolvedValueOnce({
          data: options.updatedEvent ?? options.existingEvent,
          error: null,
        }),
      update: jest.fn((data: any) => {
        captured.updateData = data;
        return eventsQuery;
      }),
    };

    const paymentsQuery: any = {
      select: jest.fn(() => paymentsQuery),
      eq: jest.fn(() => paymentsQuery),
      in: jest.fn(() => paymentsQuery),
      limit: jest.fn(() => Promise.resolve({ data: options.paymentsData ?? [], error: null })),
    };

    // SupabaseのQueryBuilderはPromiseライク（thenable）なので、awaitに対応させる
    const attendancesQuery: any = {
      select: jest.fn(() => attendancesQuery),
      eq: jest.fn(() => attendancesQuery),
      then: (resolve: AnyFn) => resolve({ data: options.attendancesData ?? [], error: null }),
    };

    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: jest.fn((table: string) => {
        if (table === "events") return eventsQuery;
        if (table === "payments") return paymentsQuery;
        if (table === "attendances") return attendancesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as any;

    jest.doMock("@core/supabase/server", () => ({ createClient: () => mockSupabase }));

    return { mockSupabase, captured };
  }

  it("fee=0 のみ更新で payment_methods が [] にクリアされる", async () => {
    const existingEvent = {
      id: "evt-1",
      created_by: "user-1",
      title: "t",
      date: new Date(Date.now() + 3600_000).toISOString(),
      registration_deadline: new Date(Date.now() + 600_000).toISOString(),
      payment_deadline: null,
      fee: 1000,
      payment_methods: ["stripe"],
      attendances: [],
    };

    const updatedEvent = { ...existingEvent, fee: 0, payment_methods: [] };
    const { captured } = mockSupabaseWith({ existingEvent, updatedEvent });

    const form = new FormData();
    form.append("fee", "0");

    // 動的 import で最新モックを反映
    // UUIDバリデーションを通すために形式だけUUIDの文字列を使用
    const { updateEventAction: run } = await import("@/features/events/actions/update-event");
    const res = await run("00000000-0000-0000-0000-000000000001", form);

    expect(res.success).toBe(true);
    expect(captured.updateData).toMatchObject({ fee: 0, payment_methods: [] });
  });

  it("空欄送信で location/description/capacity/payment_deadline がクリアされる (reg_deadlineは不変)", async () => {
    const existingEvent = {
      id: "evt-2",
      created_by: "user-1",
      title: "t",
      date: new Date(Date.now() + 3600_000).toISOString(),
      registration_deadline: new Date(Date.now() + 600_000).toISOString(),
      payment_deadline: new Date(Date.now() + 1_200_000).toISOString(),
      fee: 1000,
      payment_methods: ["cash"],
      location: "Hall",
      description: "Desc",
      capacity: 50,
      attendances: [],
    };

    const updatedEvent = {
      ...existingEvent,
      location: null,
      description: null,
      capacity: null,
      payment_deadline: null,
    };

    const { captured } = mockSupabaseWith({ existingEvent, updatedEvent, attendancesData: [] });

    const form = new FormData();
    form.append("location", "");
    form.append("description", "");
    form.append("capacity", "");
    form.append("payment_deadline", "");

    const { updateEventAction: run } = await import("@/features/events/actions/update-event");
    const res = await run("00000000-0000-0000-0000-000000000002", form);

    expect(res.success).toBe(true);
    expect(captured.updateData).toMatchObject({
      location: null,
      description: null,
      capacity: null,
      payment_deadline: null,
    });
    // registration_deadline は含まれない（DB仕様: 非NULL）
    expect(Object.prototype.hasOwnProperty.call(captured.updateData, "registration_deadline")).toBe(
      false
    );
  });
});
