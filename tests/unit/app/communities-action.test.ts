import { AppError } from "@core/errors/app-error";
import { errResult, okResult } from "@core/errors/app-result";

const mockGetCurrentUserForServerAction = jest.fn();
const mockSetCurrentCommunityCookie = jest.fn();
const mockClearCurrentCommunityCookie = jest.fn();
const mockResolveCurrentCommunityContext = jest.fn();
const mockResolveCurrentCommunityForServerAction = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();
const mockCreateCommunity = jest.fn();
const mockDeleteCommunity = jest.fn();
const mockUpdateCommunity = jest.fn();
const mockEnsureFeaturesRegistered = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: mockGetCurrentUserForServerAction,
}));

jest.mock("@core/community/current-community", () => ({
  clearCurrentCommunityCookie: mockClearCurrentCommunityCookie,
  resolveCurrentCommunityContext: mockResolveCurrentCommunityContext,
  resolveCurrentCommunityForServerAction: mockResolveCurrentCommunityForServerAction,
  setCurrentCommunityCookie: mockSetCurrentCommunityCookie,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
}));

jest.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

jest.mock("@features/communities/server", () => {
  const actual = jest.requireActual(
    "@features/communities/server"
  ) as typeof import("@features/communities/server");

  return {
    ...actual,
    createCommunity: mockCreateCommunity,
    deleteCommunity: mockDeleteCommunity,
    updateCommunity: mockUpdateCommunity,
  };
});

jest.mock("@/app/_init/feature-registrations", () => ({
  ensureFeaturesRegistered: mockEnsureFeaturesRegistered,
}));

type CommunitiesActionModule = typeof import("@/app/(app)/actions/communities");

async function loadCommunitiesActionModule(): Promise<CommunitiesActionModule> {
  jest.resetModules();
  jest.unmock("@/app/(app)/actions/communities");

  let loadedModule: CommunitiesActionModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@/app/(app)/actions/communities");
  });

  if (!loadedModule) {
    throw new Error("Failed to load communities action module");
  }

  return loadedModule;
}

describe("app/(app)/actions/communities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: "community-1",
        },
      })
    );
    mockResolveCurrentCommunityContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: "community-1",
        },
        ownedCommunities: [
          {
            id: "community-1",
            name: "ボドゲ会",
            slug: "board-games",
            createdAt: "2026-03-10T00:00:00.000Z",
          },
        ],
        requestedCommunityId: null,
        resolvedBy: "oldest_fallback",
      })
    );
  });

  it("未認証時は UNAUTHORIZED を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue(null);

    const { createCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "ボドゲ会");

    await expect(createCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "UNAUTHORIZED",
        }),
      })
    );

    expect(mockCreateCommunity).not.toHaveBeenCalled();
  });

  it("validation error は fieldErrors を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });

    const { createCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "   ");

    await expect(createCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "VALIDATION_ERROR",
          fieldErrors: {
            name: ["コミュニティ名を入力してください"],
          },
        }),
      })
    );

    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(mockCreateCommunity).not.toHaveBeenCalled();
  });

  it("成功時は cookie を更新して dashboard 遷移用 ActionResult を返す", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockCreateCommunity.mockResolvedValue(
      okResult({
        communityId: "community-1",
      })
    );

    const { createCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "  ボドゲ会  ");
    formData.set("description", "  毎週開催  ");

    await expect(createCommunityAction(formData)).resolves.toEqual({
      success: true,
      data: {
        communityId: "community-1",
      },
      message: "コミュニティを作成しました",
      redirectUrl: "/dashboard",
      needsVerification: undefined,
    });

    expect(mockCreateCommunity).toHaveBeenCalledWith(supabase, "user-1", {
      name: "ボドゲ会",
      description: "毎週開催",
    });
    expect(mockSetCurrentCommunityCookie).toHaveBeenCalledWith("community-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/(app)", "layout");
  });

  it("service failure は ActionResult の失敗へ投影する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockCreateCommunity.mockResolvedValue(
      errResult(
        new AppError("DATABASE_ERROR", {
          userMessage: "コミュニティの作成に失敗しました",
          retryable: true,
        })
      )
    );

    const { createCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "映画会");

    await expect(createCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "DATABASE_ERROR",
          userMessage: "コミュニティの作成に失敗しました",
        }),
      })
    );

    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("updateCommunityAction は未認証時に UNAUTHORIZED を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue(null);

    const { updateCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "ボドゲ会");

    await expect(updateCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "UNAUTHORIZED",
        }),
      })
    );

    expect(mockUpdateCommunity).not.toHaveBeenCalled();
  });

  it("updateCommunityAction の validation error は fieldErrors を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });

    const { updateCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "   ");

    await expect(updateCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "VALIDATION_ERROR",
          fieldErrors: {
            name: ["コミュニティ名を入力してください"],
          },
        }),
      })
    );

    expect(mockResolveCurrentCommunityForServerAction).not.toHaveBeenCalled();
    expect(mockUpdateCommunity).not.toHaveBeenCalled();
  });

  it("updateCommunityAction は current community が無ければ NOT_FOUND を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      okResult({
        currentCommunity: null,
      })
    );

    const { updateCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "ボドゲ会");

    await expect(updateCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "NOT_FOUND",
          userMessage: "更新対象のコミュニティが見つかりません",
        }),
      })
    );

    expect(mockUpdateCommunity).not.toHaveBeenCalled();
  });

  it("updateCommunityAction は current community をサーバー側で解決して更新する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: "community-9",
        },
      })
    );
    mockUpdateCommunity.mockResolvedValue(
      okResult({
        communityId: "community-9",
        name: "新しい名前",
        description: "新しい説明",
      })
    );

    const { updateCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "  新しい名前  ");
    formData.set("description", "  新しい説明  ");
    formData.set("slug", "malicious-slug");
    formData.set("created_by", "malicious-user");
    formData.set("current_payout_profile_id", "profile-x");

    await expect(updateCommunityAction(formData)).resolves.toEqual({
      success: true,
      data: {
        communityId: "community-9",
        name: "新しい名前",
        description: "新しい説明",
      },
      message: "コミュニティを更新しました",
      redirectUrl: undefined,
      needsVerification: undefined,
    });

    expect(mockResolveCurrentCommunityForServerAction).toHaveBeenCalled();
    expect(mockUpdateCommunity).toHaveBeenCalledWith(supabase, "user-1", "community-9", {
      name: "新しい名前",
      description: "新しい説明",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/(app)", "layout");
    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
  });

  it("updateCommunityAction は service failure を ActionResult に投影する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockUpdateCommunity.mockResolvedValue(
      errResult(
        new AppError("DATABASE_ERROR", {
          userMessage: "コミュニティの更新に失敗しました",
          retryable: true,
        })
      )
    );

    const { updateCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "映画会");

    await expect(updateCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "DATABASE_ERROR",
          userMessage: "コミュニティの更新に失敗しました",
        }),
      })
    );

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("updateCommunityAction は current community 解決失敗を ActionResult に投影する", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      errResult(
        new AppError("DATABASE_ERROR", {
          userMessage: "コミュニティ情報の取得に失敗しました",
          retryable: true,
        })
      )
    );

    const { updateCommunityAction } = await loadCommunitiesActionModule();
    const formData = new FormData();
    formData.set("name", "映画会");

    await expect(updateCommunityAction(formData)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "DATABASE_ERROR",
          userMessage: "コミュニティの更新に失敗しました",
        }),
      })
    );

    expect(mockUpdateCommunity).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("deleteCommunityAction は未認証時に UNAUTHORIZED を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue(null);

    const { deleteCommunityAction } = await loadCommunitiesActionModule();

    await expect(deleteCommunityAction(new FormData())).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "UNAUTHORIZED",
        }),
      })
    );

    expect(mockDeleteCommunity).not.toHaveBeenCalled();
  });

  it("deleteCommunityAction は current community が無ければ NOT_FOUND を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      okResult({
        currentCommunity: null,
      })
    );

    const { deleteCommunityAction } = await loadCommunitiesActionModule();

    await expect(deleteCommunityAction(new FormData())).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "NOT_FOUND",
          userMessage: "削除対象のコミュニティが見つかりません",
        }),
      })
    );

    expect(mockDeleteCommunity).not.toHaveBeenCalled();
  });

  it("deleteCommunityAction は representative block を ActionResult に投影する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockDeleteCommunity.mockResolvedValue(
      errResult(
        new AppError("RESOURCE_CONFLICT", {
          retryable: false,
          userMessage:
            "代表コミュニティに設定されているため削除できません。付け替え後に削除してください",
        })
      )
    );

    const { deleteCommunityAction } = await loadCommunitiesActionModule();

    await expect(deleteCommunityAction(new FormData())).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "RESOURCE_CONFLICT",
          userMessage:
            "代表コミュニティに設定されているため削除できません。付け替え後に削除してください",
        }),
      })
    );

    expect(mockResolveCurrentCommunityContext).not.toHaveBeenCalled();
    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
    expect(mockClearCurrentCommunityCookie).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("deleteCommunityAction は削除後に fallback community を cookie へ設定する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: "community-9",
        },
      })
    );
    mockDeleteCommunity.mockResolvedValue(
      okResult({
        communityId: "community-9",
      })
    );
    mockResolveCurrentCommunityContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: "community-2",
          name: "読書会",
          slug: "reading",
          createdAt: "2026-03-11T00:00:00.000Z",
        },
        ownedCommunities: [
          {
            id: "community-2",
            name: "読書会",
            slug: "reading",
            createdAt: "2026-03-11T00:00:00.000Z",
          },
        ],
        requestedCommunityId: null,
        resolvedBy: "oldest_fallback",
      })
    );

    const { deleteCommunityAction } = await loadCommunitiesActionModule();

    await expect(deleteCommunityAction(new FormData())).resolves.toEqual({
      success: true,
      data: {
        deletedCommunityId: "community-9",
        nextCurrentCommunityId: "community-2",
      },
      message: "コミュニティを削除しました",
      redirectUrl: "/dashboard",
      needsVerification: undefined,
    });

    expect(mockDeleteCommunity).toHaveBeenCalledWith(supabase, "user-1", "community-9");
    expect(mockResolveCurrentCommunityContext).toHaveBeenCalledWith({
      requestedCommunityId: null,
      supabase,
      userId: "user-1",
    });
    expect(mockSetCurrentCommunityCookie).toHaveBeenCalledWith("community-2");
    expect(mockClearCurrentCommunityCookie).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/(app)", "layout");
  });

  it("deleteCommunityAction は最後の1件を削除したら cookie を削除する", async () => {
    const supabase = { from: jest.fn() };
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockDeleteCommunity.mockResolvedValue(
      okResult({
        communityId: "community-1",
      })
    );
    mockResolveCurrentCommunityContext.mockResolvedValue(
      okResult({
        currentCommunity: null,
        ownedCommunities: [],
        requestedCommunityId: null,
        resolvedBy: "empty",
      })
    );

    const { deleteCommunityAction } = await loadCommunitiesActionModule();

    await expect(deleteCommunityAction(new FormData())).resolves.toEqual({
      success: true,
      data: {
        deletedCommunityId: "community-1",
        nextCurrentCommunityId: null,
      },
      message: "コミュニティを削除しました",
      redirectUrl: "/dashboard",
      needsVerification: undefined,
    });

    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
    expect(mockClearCurrentCommunityCookie).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/(app)", "layout");
  });
});
