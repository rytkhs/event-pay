const mockCreateAuditedAdminClient = jest.fn();

jest.mock("@core/security/secure-client-factory.impl", () => ({
  createAuditedAdminClient: (...args: unknown[]) => mockCreateAuditedAdminClient(...args),
}));

import { deleteCommunity } from "@features/communities/services/delete-community";

type CountQueryResponse = {
  count?: number | null;
  error?: unknown;
};

type UpdateQueryResponse = {
  count?: number | null;
  error: unknown;
};

type SelectQueryResponse = {
  data: unknown;
  error: unknown;
};

function createSupabaseMock({
  representativeUsage,
  existingCommunityResponse,
  deleteResponse,
}: {
  representativeUsage?: CountQueryResponse;
  existingCommunityResponse: SelectQueryResponse;
  deleteResponse: UpdateQueryResponse;
}) {
  const updatePayloads: unknown[] = [];
  const updateOptions: unknown[] = [];

  const communitiesMaybeSingle = jest.fn().mockResolvedValue(existingCommunityResponse);
  const communitiesSelectEqIsDeleted = jest
    .fn()
    .mockReturnValue({ maybeSingle: communitiesMaybeSingle });
  const communitiesSelectEqCreatedBy = jest
    .fn()
    .mockReturnValue({ eq: communitiesSelectEqIsDeleted });
  const communitiesSelectEqId = jest.fn().mockReturnValue({ eq: communitiesSelectEqCreatedBy });
  const communitiesSelect = jest.fn().mockReturnValue({ eq: communitiesSelectEqId });

  const adminCommunitiesUpdateEqIsDeleted = jest.fn().mockResolvedValue({
    count: deleteResponse.count ?? null,
    error: deleteResponse.error,
  });
  const adminCommunitiesUpdateEqCreatedBy = jest
    .fn()
    .mockReturnValue({ eq: adminCommunitiesUpdateEqIsDeleted });
  const adminCommunitiesUpdateEqId = jest
    .fn()
    .mockReturnValue({ eq: adminCommunitiesUpdateEqCreatedBy });
  const adminCommunitiesUpdate = jest.fn((payload: unknown, options?: unknown) => {
    updatePayloads.push(payload);
    updateOptions.push(options);
    return { eq: adminCommunitiesUpdateEqId };
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
      return { select: communitiesSelect };
    }

    if (table === "payout_profiles") {
      return { select: payoutProfilesSelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const adminFrom = jest.fn((table: string) => {
    if (table === "communities") {
      return { update: adminCommunitiesUpdate };
    }

    throw new Error(`Unexpected admin table: ${table}`);
  });

  const adminClient = { from: adminFrom } as never;
  mockCreateAuditedAdminClient.mockResolvedValue(adminClient);

  return {
    supabase: { from } as never,
    spies: {
      from,
      adminFrom,
      updatePayloads,
      updateOptions,
      payoutProfilesSelect,
      payoutProfilesEqOwnerUserId,
      payoutProfilesEqRepresentativeCommunity,
      communitiesSelect,
      communitiesMaybeSingle,
      communitiesSelectEqId,
      communitiesSelectEqCreatedBy,
      communitiesSelectEqIsDeleted,
      adminCommunitiesUpdate,
      adminCommunitiesUpdateEqId,
      adminCommunitiesUpdateEqCreatedBy,
      adminCommunitiesUpdateEqIsDeleted,
    },
  };
}

describe("features/communities/services/delete-community", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未使用の community を論理削除する", async () => {
    const { supabase, spies } = createSupabaseMock({
      existingCommunityResponse: {
        data: {
          id: "community-1",
        },
        error: null,
      },
      deleteResponse: {
        count: 1,
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
    expect(spies.communitiesSelect).toHaveBeenCalledWith("id");
    expect(spies.communitiesSelectEqId).toHaveBeenCalledWith("id", "community-1");
    expect(spies.communitiesSelectEqCreatedBy).toHaveBeenCalledWith("created_by", "user-1");
    expect(spies.communitiesSelectEqIsDeleted).toHaveBeenCalledWith("is_deleted", false);
    expect(mockCreateAuditedAdminClient).toHaveBeenCalledWith(
      "community_management",
      "Soft delete community: community-1",
      expect.objectContaining({
        userId: "user-1",
        operationType: "UPDATE",
        accessedTables: ["public.communities"],
      })
    );
    expect(spies.adminFrom).toHaveBeenCalledWith("communities");
    expect(spies.updatePayloads).toEqual([
      {
        is_deleted: true,
        deleted_at: expect.any(String),
      },
    ]);
    expect(spies.updateOptions).toEqual([{ count: "exact" }]);
    expect(spies.adminCommunitiesUpdateEqId).toHaveBeenCalledWith("id", "community-1");
    expect(spies.adminCommunitiesUpdateEqCreatedBy).toHaveBeenCalledWith("created_by", "user-1");
    expect(spies.adminCommunitiesUpdateEqIsDeleted).toHaveBeenCalledWith("is_deleted", false);
  });

  it("representative community は RESOURCE_CONFLICT を返す", async () => {
    const { supabase, spies } = createSupabaseMock({
      representativeUsage: {
        count: 1,
      },
      existingCommunityResponse: {
        data: null,
        error: null,
      },
      deleteResponse: {
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
    expect(spies.adminCommunitiesUpdate).not.toHaveBeenCalled();
    expect(mockCreateAuditedAdminClient).not.toHaveBeenCalled();
  });

  it("削除対象が無ければ NOT_FOUND を返す", async () => {
    const { supabase } = createSupabaseMock({
      existingCommunityResponse: {
        data: null,
        error: null,
      },
      deleteResponse: {
        count: 0,
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
    expect(mockCreateAuditedAdminClient).not.toHaveBeenCalled();
  });

  it("representative usage の取得失敗は DATABASE_ERROR を返す", async () => {
    const { supabase } = createSupabaseMock({
      representativeUsage: {
        error: {
          message: "database failed",
        },
      },
      existingCommunityResponse: {
        data: null,
        error: null,
      },
      deleteResponse: {
        count: 0,
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
      existingCommunityResponse: {
        data: {
          id: "community-1",
        },
        error: null,
      },
      deleteResponse: {
        count: null,
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

  it("削除対象取得の失敗は DATABASE_ERROR を返す", async () => {
    const { supabase } = createSupabaseMock({
      existingCommunityResponse: {
        data: null,
        error: {
          message: "database failed",
        },
      },
      deleteResponse: {
        count: 0,
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

  it("論理削除 update で count 0 は NOT_FOUND を返す", async () => {
    const { supabase } = createSupabaseMock({
      existingCommunityResponse: {
        data: {
          id: "community-1",
        },
        error: null,
      },
      deleteResponse: {
        count: 0,
        error: null,
      },
    });

    const result = await deleteCommunity(supabase, "user-1", "community-1");

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.userMessage).toBe("削除対象のコミュニティが見つかりません");
  });
});
