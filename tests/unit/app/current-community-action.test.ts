import { jest } from "@jest/globals";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult } from "@core/errors/app-result";

const mockGetCurrentUserForServerAction = jest.fn();
const mockResolveCurrentCommunityContext = jest.fn();
const mockSetCurrentCommunityCookie = jest.fn();
const mockClearCurrentCommunityCookie = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();
const mockEnsureFeaturesRegistered = jest.fn();

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: mockGetCurrentUserForServerAction,
}));

jest.mock("@core/community/current-community", () => ({
  clearCurrentCommunityCookie: mockClearCurrentCommunityCookie,
  resolveCurrentCommunityContext: mockResolveCurrentCommunityContext,
  setCurrentCommunityCookie: mockSetCurrentCommunityCookie,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
}));

jest.mock("@/app/_init/feature-registrations", () => ({
  ensureFeaturesRegistered: mockEnsureFeaturesRegistered,
}));

type CurrentCommunityActionModule = typeof import("@/app/(app)/actions/current-community");

async function loadCurrentCommunityActionModule(): Promise<CurrentCommunityActionModule> {
  jest.resetModules();
  jest.unmock("@/app/(app)/actions/current-community");
  let loadedModule: CurrentCommunityActionModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@/app/(app)/actions/current-community");
  });

  if (!loadedModule) {
    throw new Error("Failed to load current-community action module");
  }

  return (
    (loadedModule as CurrentCommunityActionModule & { default?: CurrentCommunityActionModule })
      .default ?? loadedModule
  );
}

describe("app/(app)/actions/current-community", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未認証時は UNAUTHORIZED を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue(null);

    const { updateCurrentCommunityAction } = await loadCurrentCommunityActionModule();

    await expect(
      updateCurrentCommunityAction("84b9e6ca-8b96-4d0a-bb62-4e7648f59223")
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "UNAUTHORIZED",
        }),
      })
    );

    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("null 指定時は current community cookie を削除する", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });

    const { updateCurrentCommunityAction } = await loadCurrentCommunityActionModule();

    await expect(updateCurrentCommunityAction(null)).resolves.toEqual({
      success: true,
      data: {
        currentCommunityId: null,
      },
      message: undefined,
      redirectUrl: undefined,
      needsVerification: undefined,
    });

    expect(mockClearCurrentCommunityCookie).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
  });

  it("不正な UUID は VALIDATION_ERROR を返す", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });

    const { updateCurrentCommunityAction } = await loadCurrentCommunityActionModule();

    await expect(updateCurrentCommunityAction("invalid")).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "VALIDATION_ERROR",
          fieldErrors: {
            nextCommunityId: ["有効なコミュニティIDを指定してください"],
          },
        }),
      })
    );

    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("owner 所有 community のみ cookie を更新する", async () => {
    const supabase = { from: jest.fn() };
    const targetCommunityId = "84b9e6ca-8b96-4d0a-bb62-4e7648f59223";

    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockResolveCurrentCommunityContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: targetCommunityId,
          name: "Community A",
          slug: "community-a",
          createdAt: "2026-03-10T00:00:00.000Z",
        },
        ownedCommunities: [],
        requestedCommunityId: targetCommunityId,
        cookieMutation: "none",
        resolvedBy: "cookie",
      })
    );

    const { updateCurrentCommunityAction } = await loadCurrentCommunityActionModule();

    await expect(updateCurrentCommunityAction(targetCommunityId)).resolves.toEqual({
      success: true,
      data: {
        currentCommunityId: targetCommunityId,
      },
      message: undefined,
      redirectUrl: undefined,
      needsVerification: undefined,
    });

    expect(mockResolveCurrentCommunityContext).toHaveBeenCalledWith({
      requestedCommunityId: targetCommunityId,
      supabase,
      userId: "user-1",
    });
    expect(mockSetCurrentCommunityCookie).toHaveBeenCalledWith(targetCommunityId);
  });

  it("他人の community は FORBIDDEN を返す", async () => {
    const targetCommunityId = "84b9e6ca-8b96-4d0a-bb62-4e7648f59223";

    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue({ from: jest.fn() });
    mockResolveCurrentCommunityContext.mockResolvedValue(
      okResult({
        currentCommunity: {
          id: "fallback-community",
          name: "Fallback",
          slug: "fallback",
          createdAt: "2026-03-10T00:00:00.000Z",
        },
        ownedCommunities: [],
        requestedCommunityId: targetCommunityId,
        cookieMutation: "set",
        resolvedBy: "oldest_fallback",
      })
    );

    const { updateCurrentCommunityAction } = await loadCurrentCommunityActionModule();

    await expect(updateCurrentCommunityAction(targetCommunityId)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "FORBIDDEN",
        }),
      })
    );

    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
  });

  it("community 解決失敗は ActionResult の失敗へ投影する", async () => {
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockCreateServerActionSupabaseClient.mockResolvedValue({ from: jest.fn() });
    mockResolveCurrentCommunityContext.mockResolvedValue(
      errResult(
        new AppError("DATABASE_ERROR", {
          userMessage: "コミュニティ情報の取得に失敗しました",
          retryable: true,
        })
      )
    );

    const { updateCurrentCommunityAction } = await loadCurrentCommunityActionModule();

    await expect(
      updateCurrentCommunityAction("84b9e6ca-8b96-4d0a-bb62-4e7648f59223")
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "DATABASE_ERROR",
          userMessage: "現在選択中コミュニティの更新に失敗しました",
        }),
      })
    );

    expect(mockSetCurrentCommunityCookie).not.toHaveBeenCalled();
  });
});
