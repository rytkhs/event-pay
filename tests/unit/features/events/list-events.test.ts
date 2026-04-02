import { listEventsForCommunity } from "@features/events/services/list-events";

type Operation = {
  method: string;
  args: unknown[];
};

class MockQueryBuilder {
  public readonly operations: Operation[] = [];

  constructor(
    private readonly response: {
      count?: number | null;
      data?: unknown;
      error?: unknown;
    }
  ) {}

  select(...args: unknown[]) {
    this.operations.push({ method: "select", args });
    return this;
  }

  eq(...args: unknown[]) {
    this.operations.push({ method: "eq", args });
    return this;
  }

  neq(...args: unknown[]) {
    this.operations.push({ method: "neq", args });
    return this;
  }

  is(...args: unknown[]) {
    this.operations.push({ method: "is", args });
    return this;
  }

  not(...args: unknown[]) {
    this.operations.push({ method: "not", args });
    return this;
  }

  gt(...args: unknown[]) {
    this.operations.push({ method: "gt", args });
    return this;
  }

  gte(...args: unknown[]) {
    this.operations.push({ method: "gte", args });
    return this;
  }

  lte(...args: unknown[]) {
    this.operations.push({ method: "lte", args });
    return this;
  }

  order(...args: unknown[]) {
    this.operations.push({ method: "order", args });
    return this;
  }

  range(...args: unknown[]) {
    this.operations.push({ method: "range", args });
    return this;
  }

  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.response).then(resolve, reject);
  }
}

function createSupabaseMock(eventsData: unknown[] = [], totalCount = 0) {
  const eventsQuery = new MockQueryBuilder({
    data: eventsData,
    error: null,
  });
  const countQuery = new MockQueryBuilder({
    count: totalCount,
    error: null,
  });

  return {
    supabase: {
      from: jest.fn().mockReturnValueOnce(eventsQuery).mockReturnValueOnce(countQuery),
    },
    eventsQuery,
    countQuery,
  };
}

function getOperationsByMethod(query: MockQueryBuilder, method: string) {
  return query.operations.filter((operation) => operation.method === method);
}

describe("listEventsForCommunity", () => {
  it("created_by ではなく community_id を一覧フィルタの主軸にする", async () => {
    const { supabase, eventsQuery, countQuery } = createSupabaseMock(
      [
        {
          id: "event-1",
          title: "交流会",
          date: "2099-03-07T10:00:00.000Z",
          location: "Tokyo",
          fee: 1500,
          capacity: 20,
          created_at: "2099-03-01T10:00:00.000Z",
          canceled_at: null,
          attendances: [{ status: "attending" }, { status: "pending" }],
        },
      ],
      1
    );

    const result = await listEventsForCommunity(supabase as never, "community-1");

    expect(result).toEqual({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            id: "event-1",
            title: "交流会",
            attendances_count: 1,
          }),
        ],
        totalCount: 1,
        hasMore: false,
      },
      meta: undefined,
    });

    const eqOperations = [
      ...getOperationsByMethod(eventsQuery, "eq"),
      ...getOperationsByMethod(countQuery, "eq"),
    ];

    expect(eqOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          args: ["community_id", "community-1"],
        }),
      ])
    );
    expect(eqOperations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          args: ["created_by", expect.anything()],
        }),
      ])
    );
  });

  it("payment / status / date filter を従来どおり組み立てる", async () => {
    const { supabase, eventsQuery, countQuery } = createSupabaseMock([], 0);

    const result = await listEventsForCommunity(supabase as never, "community-2", {
      paymentFilter: "paid",
      statusFilter: "canceled",
      dateFilter: {
        start: "2026-03-01",
        end: "2026-03-31",
      },
      sortBy: "created_at",
      sortOrder: "asc",
      limit: 12,
      offset: 12,
    });

    expect(result.success).toBe(true);
    expect(getOperationsByMethod(eventsQuery, "gt")).toEqual(
      expect.arrayContaining([expect.objectContaining({ args: ["fee", 0] })])
    );
    expect(getOperationsByMethod(eventsQuery, "not")).toEqual(
      expect.arrayContaining([expect.objectContaining({ args: ["canceled_at", "is", null] })])
    );
    expect(getOperationsByMethod(eventsQuery, "gte")).toHaveLength(1);
    expect(getOperationsByMethod(eventsQuery, "lte")).toHaveLength(1);
    expect(getOperationsByMethod(eventsQuery, "order")).toEqual([
      expect.objectContaining({ args: ["created_at", { ascending: true }] }),
    ]);
    expect(getOperationsByMethod(eventsQuery, "range")).toEqual([
      expect.objectContaining({ args: [12, 23] }),
    ]);
    expect(getOperationsByMethod(countQuery, "gt")).toEqual(
      expect.arrayContaining([expect.objectContaining({ args: ["fee", 0] })])
    );
  });

  it("不正な sortOrder なら VALIDATION_ERROR を返す", async () => {
    const { supabase } = createSupabaseMock();

    const result = await listEventsForCommunity(supabase as never, "community-3", {
      sortOrder: "invalid" as never,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected validation failure");
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.userMessage).toBe("sortOrderは'asc'または'desc'である必要があります");
  });
});
