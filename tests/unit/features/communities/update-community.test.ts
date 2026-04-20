jest.mock("@core/logging/app-logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn().mockReturnThis(),
  },
}));

import { logger } from "@core/logging/app-logger";
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

  it("description は任意のまま1000文字以内に制限する", () => {
    expect(
      updateCommunitySchema.parse({
        name: "ボドゲ会",
      })
    ).toEqual({
      name: "ボドゲ会",
      description: null,
    });

    expect(
      updateCommunitySchema.parse({
        name: "ボドゲ会",
        description: "あ".repeat(1000),
      })
    ).toEqual({
      name: "ボドゲ会",
      description: "あ".repeat(1000),
    });

    const result = updateCommunitySchema.safeParse({
      name: "ボドゲ会",
      description: "あ".repeat(1001),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.description).toEqual([
        "コミュニティ説明は1000文字以内で入力してください",
      ]);
    }
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
    expect(logger.info).toHaveBeenCalledWith(
      "Community updated",
      expect.objectContaining({
        category: "system",
        action: "community.update",
        outcome: "success",
        user_id: "user-1",
        communityId: "community-1",
      })
    );
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
    expect(logger.warn).toHaveBeenCalledWith(
      "Community update target not found",
      expect.objectContaining({
        category: "system",
        action: "community.update",
        outcome: "failure",
        user_id: "user-1",
        communityId: "community-x",
      })
    );
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
    expect(logger.error).toHaveBeenCalledWith(
      "Community update failed",
      expect.objectContaining({
        category: "system",
        action: "community.update",
        outcome: "failure",
        user_id: "user-1",
        communityId: "community-1",
      })
    );
  });
});
