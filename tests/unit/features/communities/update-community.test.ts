import { updateCommunitySchema } from "@features/communities/server";
import { updateCommunity } from "@features/communities/services/update-community";

type QueryResponse = {
  data: unknown;
  error: unknown;
};

function createSupabaseMock(response: QueryResponse) {
  const updatePayloads: unknown[] = [];

  const maybeSingle = jest.fn().mockResolvedValue(response);
  const select = jest.fn().mockReturnValue({ maybeSingle });
  const eqIsDeleted = jest.fn().mockReturnValue({ select });
  const eqCreatedBy = jest.fn().mockReturnValue({ eq: eqIsDeleted });
  const eqId = jest.fn().mockReturnValue({ eq: eqCreatedBy });
  const update = jest.fn((payload: unknown) => {
    updatePayloads.push(payload);
    return { eq: eqId };
  });

  const from = jest.fn((table: string) => {
    if (table === "communities") {
      return { update };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from } as never,
    spies: {
      from,
      update,
      updatePayloads,
      eqId,
      eqCreatedBy,
      eqIsDeleted,
      select,
      maybeSingle,
    },
  };
}

describe("features/communities/services/update-community", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("description の空文字は schema で null に正規化する", () => {
    expect(
      updateCommunitySchema.parse({
        name: "  ボドゲ会  ",
        description: "   ",
      })
    ).toEqual({
      name: "ボドゲ会",
      description: null,
    });
  });

  it("name と description だけを更新する", async () => {
    const { supabase, spies } = createSupabaseMock({
      data: {
        id: "community-1",
        name: "新しい名前",
        description: "新しい説明",
      },
      error: null,
    });

    const result = await updateCommunity(supabase, "user-1", "community-1", {
      name: "新しい名前",
      description: "新しい説明",
    });

    expect(result).toEqual({
      success: true,
      data: {
        communityId: "community-1",
        name: "新しい名前",
        description: "新しい説明",
      },
      meta: undefined,
    });
    expect(spies.from).toHaveBeenCalledWith("communities");
    expect(spies.updatePayloads).toEqual([
      {
        name: "新しい名前",
        description: "新しい説明",
      },
    ]);
    expect(spies.eqId).toHaveBeenCalledWith("id", "community-1");
    expect(spies.eqCreatedBy).toHaveBeenCalledWith("created_by", "user-1");
    expect(spies.eqIsDeleted).toHaveBeenCalledWith("is_deleted", false);
    expect(spies.select).toHaveBeenCalledWith("id, name, description");
  });

  it("更新対象が無ければ NOT_FOUND を返す", async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: null,
    });

    const result = await updateCommunity(supabase, "user-1", "community-x", {
      name: "名前",
      description: null,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.userMessage).toBe("更新対象のコミュニティが見つかりません");
  });

  it("DB エラー時は DATABASE_ERROR を返す", async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: {
        code: "PGRST116",
        message: "database failed",
      },
    });

    const result = await updateCommunity(supabase, "user-1", "community-1", {
      name: "名前",
      description: null,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.userMessage).toBe("コミュニティの更新に失敗しました");
  });
});
