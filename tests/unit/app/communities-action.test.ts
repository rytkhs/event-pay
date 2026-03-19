import { AppError } from "@core/errors/app-error";
import { errResult, okResult } from "@core/errors/app-result";

const mockGetCurrentUserForServerAction = jest.fn();
const mockSetCurrentCommunityCookie = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();
const mockCreateCommunity = jest.fn();
const mockEnsureFeaturesRegistered = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: mockGetCurrentUserForServerAction,
}));

jest.mock("@core/community/current-community", () => ({
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
});
