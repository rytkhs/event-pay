import { createCommunitySchema } from "@features/communities/server";
import { createCommunity } from "@features/communities/services/create-community";

type QueryResponse = {
  data: unknown;
  error: unknown;
};

function createSupabaseMock({
  insertResponses,
  payoutProfileResponse = { data: null, error: null },
}: {
  insertResponses: QueryResponse[];
  payoutProfileResponse?: QueryResponse;
}) {
  const insertPayloads: unknown[] = [];

  const payoutMaybeSingle = jest.fn().mockResolvedValue(payoutProfileResponse);
  const payoutEq = jest.fn().mockReturnValue({
    maybeSingle: payoutMaybeSingle,
  });
  const payoutSelect = jest.fn().mockReturnValue({
    eq: payoutEq,
  });

  const insert = jest.fn((payload: unknown) => {
    insertPayloads.push(payload);

    const nextResponse = insertResponses.shift() ?? {
      data: null,
      error: new Error("missing insert response"),
    };

    return {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue(nextResponse),
      }),
    };
  });

  const from = jest.fn((table: string) => {
    if (table === "payout_profiles") {
      return {
        select: payoutSelect,
      };
    }

    if (table === "communities") {
      return {
        insert,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: {
      from,
    } as never,
    spies: {
      from,
      insert,
      insertPayloads,
      payoutEq,
      payoutMaybeSingle,
      payoutSelect,
    },
  };
}

describe("features/communities/services/create-community", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("description の空文字は schema で null に正規化する", () => {
    expect(
      createCommunitySchema.parse({
        name: "  ボドゲ会  ",
        description: "   ",
      })
    ).toEqual({
      name: "ボドゲ会",
      description: null,
    });
  });

  it("owner の payout profile があれば current_payout_profile_id を初期設定する", async () => {
    const { supabase, spies } = createSupabaseMock({
      payoutProfileResponse: {
        data: { id: "profile-1" },
        error: null,
      },
      insertResponses: [
        {
          data: { id: "community-1" },
          error: null,
        },
      ],
    });

    const result = await createCommunity(supabase, "user-1", {
      name: "ボドゲ会",
      description: "毎週開催",
    });

    expect(result).toEqual({
      success: true,
      data: {
        communityId: "community-1",
      },
      meta: undefined,
    });
    expect(spies.payoutEq).toHaveBeenCalledWith("owner_user_id", "user-1");
    expect(spies.insertPayloads).toEqual([
      {
        created_by: "user-1",
        current_payout_profile_id: "profile-1",
        description: "毎週開催",
        name: "ボドゲ会",
      },
    ]);
    expect(spies.insertPayloads[0]).not.toHaveProperty("representative_community_id");
  });

  it("owner の payout profile が無ければ current_payout_profile_id は null のまま作成する", async () => {
    const { supabase, spies } = createSupabaseMock({
      insertResponses: [
        {
          data: { id: "community-2" },
          error: null,
        },
      ],
    });

    const result = await createCommunity(supabase, "user-2", {
      name: "読書会",
      description: null,
    });

    expect(result.success).toBe(true);
    expect(spies.insertPayloads).toEqual([
      {
        created_by: "user-2",
        current_payout_profile_id: null,
        description: null,
        name: "読書会",
      },
    ]);
  });

  it("slug の unique 衝突時は insert を再試行する", async () => {
    const { supabase, spies } = createSupabaseMock({
      insertResponses: [
        {
          data: null,
          error: {
            code: "23505",
            message: "duplicate key value violates unique constraint",
          },
        },
        {
          data: { id: "community-3" },
          error: null,
        },
      ],
    });

    const result = await createCommunity(supabase, "user-3", {
      name: "映画会",
      description: "月一開催",
    });

    expect(result.success).toBe(true);
    expect(spies.insert).toHaveBeenCalledTimes(2);
    expect(spies.insertPayloads).toEqual([
      {
        created_by: "user-3",
        current_payout_profile_id: null,
        description: "月一開催",
        name: "映画会",
      },
      {
        created_by: "user-3",
        current_payout_profile_id: null,
        description: "月一開催",
        name: "映画会",
      },
    ]);
  });

  it("payout profile lookup エラー時は DATABASE_ERROR を返して insert しない", async () => {
    const { supabase, spies } = createSupabaseMock({
      payoutProfileResponse: {
        data: null,
        error: {
          code: "PGRST116",
          message: "database failed",
        },
      },
      insertResponses: [],
    });

    const result = await createCommunity(supabase, "user-4", {
      name: "散歩会",
      description: null,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(spies.insert).not.toHaveBeenCalled();
  });
});
