import { deleteCommunity } from "@features/communities/services/delete-community";

type CountQueryResponse = {
  count?: number | null;
  error?: unknown;
};

type UpdateQueryResponse = {
  data: unknown;
  error: unknown;
};

function createSupabaseMock({
  representativeUsage,
  deleteResponse,
}: {
  representativeUsage?: CountQueryResponse;
  deleteResponse: UpdateQueryResponse;
}) {
  const updatePayloads: unknown[] = [];

  const communitiesMaybeSingle = jest.fn().mockResolvedValue(deleteResponse);
  const communitiesSelect = jest.fn().mockReturnValue({ maybeSingle: communitiesMaybeSingle });
  const communitiesEqIsDeleted = jest.fn().mockReturnValue({ select: communitiesSelect });
  const communitiesEqCreatedBy = jest.fn().mockReturnValue({ eq: communitiesEqIsDeleted });
  const communitiesEqId = jest.fn().mockReturnValue({ eq: communitiesEqCreatedBy });
  const communitiesUpdate = jest.fn((payload: unknown) => {
    updatePayloads.push(payload);
    return { eq: communitiesEqId };
  });

  const payoutProfilesEqRepresentativeCommunity = jest.fn().mockResolvedValue({
    count: representativeUsage?.count ?? 0,
    error: representativeUsage?.error ?? null,
  });
  const payoutProfilesEqOwnerUserId = jest.fn().mockReturnValue({
    eq: payoutProfilesEqRepresentativeCommunity,
  });
  const payoutProfilesSelect = jest.fn().mockReturnValue({ eq: payoutProfilesEqOwnerUserId });

  const from = jest.fn((table: string) => {
    if (table === "communities") {
      return { update: communitiesUpdate };
    }

    if (table === "payout_profiles") {
      return { select: payoutProfilesSelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from } as never,
    spies: {
      from,
      updatePayloads,
      payoutProfilesSelect,
      payoutProfilesEqOwnerUserId,
      payoutProfilesEqRepresentativeCommunity,
      communitiesUpdate,
      communitiesEqId,
      communitiesEqCreatedBy,
      communitiesEqIsDeleted,
      communitiesSelect,
      communitiesMaybeSingle,
    },
  };
}

describe("features/communities/services/delete-community", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未使用の community を論理削除する", async () => {
    const { supabase, spies } = createSupabaseMock({
      deleteResponse: {
        data: {
          id: "community-1",
        },
        error: null,
      },
    });

    const result = await deleteCommunity(supabase, "user-1", "community-1");

    expect(result).toEqual({
      success: true,
      data: {
        communityId: "community-1",
      },
      meta: undefined,
    });
    expect(spies.from).toHaveBeenCalledWith("payout_profiles");
    expect(spies.payoutProfilesSelect).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(spies.payoutProfilesEqOwnerUserId).toHaveBeenCalledWith("owner_user_id", "user-1");
    expect(spies.payoutProfilesEqRepresentativeCommunity).toHaveBeenCalledWith(
      "representative_community_id",
      "community-1"
    );
    expect(spies.from).toHaveBeenCalledWith("communities");
    expect(spies.updatePayloads).toEqual([
      {
        is_deleted: true,
        deleted_at: expect.any(String),
      },
    ]);
    expect(spies.communitiesEqId).toHaveBeenCalledWith("id", "community-1");
    expect(spies.communitiesEqCreatedBy).toHaveBeenCalledWith("created_by", "user-1");
    expect(spies.communitiesEqIsDeleted).toHaveBeenCalledWith("is_deleted", false);
    expect(spies.communitiesSelect).toHaveBeenCalledWith("id");
  });

  it("representative community は RESOURCE_CONFLICT を返す", async () => {
    const { supabase, spies } = createSupabaseMock({
      representativeUsage: {
        count: 1,
      },
      deleteResponse: {
        data: null,
        error: null,
      },
    });

    const result = await deleteCommunity(supabase, "user-1", "community-1");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("RESOURCE_CONFLICT");
    expect(result.error.userMessage).toBe(
      "代表コミュニティに設定されているため削除できません。付け替え後に削除してください"
    );
    expect(spies.communitiesUpdate).not.toHaveBeenCalled();
  });

  it("削除対象が無ければ NOT_FOUND を返す", async () => {
    const { supabase } = createSupabaseMock({
      deleteResponse: {
        data: null,
        error: null,
      },
    });

    const result = await deleteCommunity(supabase, "user-1", "community-x");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.userMessage).toBe("削除対象のコミュニティが見つかりません");
  });

  it("representative usage の取得失敗は DATABASE_ERROR を返す", async () => {
    const { supabase } = createSupabaseMock({
      representativeUsage: {
        error: {
          message: "database failed",
        },
      },
      deleteResponse: {
        data: null,
        error: null,
      },
    });

    const result = await deleteCommunity(supabase, "user-1", "community-1");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.userMessage).toBe("コミュニティの削除に失敗しました");
  });

  it("論理削除 update の失敗は DATABASE_ERROR を返す", async () => {
    const { supabase } = createSupabaseMock({
      deleteResponse: {
        data: null,
        error: {
          message: "database failed",
        },
      },
    });

    const result = await deleteCommunity(supabase, "user-1", "community-1");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.userMessage).toBe("コミュニティの削除に失敗しました");
  });
});
