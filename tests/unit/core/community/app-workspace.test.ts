import { jest } from "@jest/globals";

const requireCurrentAppUserForServerComponent = jest.fn();
const resolveCurrentCommunityForServerComponent = jest.fn();
const redirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

jest.mock("@core/auth/auth-utils", () => ({
  requireCurrentAppUserForServerComponent,
}));

jest.mock("next/navigation", () => ({
  redirect,
}));

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerComponent,
}));

type AppWorkspaceModule = typeof import("@core/community/app-workspace");

async function loadAppWorkspaceModule(): Promise<AppWorkspaceModule> {
  jest.resetModules();
  jest.unmock("@core/community/app-workspace");

  let loadedModule: AppWorkspaceModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@core/community/app-workspace");
  });

  if (!loadedModule) {
    throw new Error("Failed to load app-workspace module");
  }

  return loadedModule;
}

describe("core/community/app-workspace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("認証ユーザーと current community 解決結果を 1 つの workspace context にまとめる", async () => {
    requireCurrentAppUserForServerComponent.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "集金 太郎",
    });
    resolveCurrentCommunityForServerComponent.mockResolvedValue({
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
        slug: "board-games",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      ownedCommunities: [
        {
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      requestedCommunityId: "community-1",
      resolvedBy: "cookie",
    });

    const { resolveAppWorkspaceForServerComponent } = await loadAppWorkspaceModule();

    await expect(resolveAppWorkspaceForServerComponent()).resolves.toEqual({
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        name: "集金 太郎",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
        slug: "board-games",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      ownedCommunities: [
        {
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      hasOwnedCommunities: true,
      isCommunityEmptyState: false,
      currentCommunityResolution: {
        currentCommunity: {
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
        ownedCommunities: [
          {
            id: "community-1",
            name: "ボドゲ会",
            slug: "board-games",
            createdAt: "2026-03-01T00:00:00.000Z",
          },
        ],
        requestedCommunityId: "community-1",
        resolvedBy: "cookie",
      },
    });
    expect(resolveCurrentCommunityForServerComponent).toHaveBeenCalledWith({
      id: "user-1",
      email: "owner@example.com",
      name: "集金 太郎",
    });
  });

  it("owned community が 0 件なら空状態フラグを返し shell data へ内部情報を漏らさない", async () => {
    requireCurrentAppUserForServerComponent.mockResolvedValue({
      id: "user-2",
      email: "empty@example.com",
      name: "empty@example.com",
    });
    resolveCurrentCommunityForServerComponent.mockResolvedValue({
      currentCommunity: null,
      ownedCommunities: [],
      requestedCommunityId: null,
      resolvedBy: "empty",
    });

    const { resolveAppWorkspaceForServerComponent, toAppWorkspaceShellData } =
      await loadAppWorkspaceModule();

    const workspace = await resolveAppWorkspaceForServerComponent();
    const shell = toAppWorkspaceShellData(workspace);

    expect(workspace.hasOwnedCommunities).toBe(false);
    expect(workspace.isCommunityEmptyState).toBe(true);
    expect(shell).toEqual({
      currentCommunity: null,
      ownedCommunities: [],
      hasOwnedCommunities: false,
      isCommunityEmptyState: true,
    });
    expect(shell).not.toHaveProperty("currentCommunityResolution");
  });

  it("requireNonEmptyCommunityWorkspaceForServerComponent は空状態なら /dashboard に redirect する", async () => {
    requireCurrentAppUserForServerComponent.mockResolvedValue({
      id: "user-2",
      email: "empty@example.com",
      name: "empty@example.com",
    });
    resolveCurrentCommunityForServerComponent.mockResolvedValue({
      currentCommunity: null,
      ownedCommunities: [],
      requestedCommunityId: null,
      resolvedBy: "empty",
    });

    const { requireNonEmptyCommunityWorkspaceForServerComponent } = await loadAppWorkspaceModule();

    await expect(requireNonEmptyCommunityWorkspaceForServerComponent()).rejects.toThrow(
      "NEXT_REDIRECT:/communities/create"
    );
    expect(redirect).toHaveBeenCalledWith("/communities/create");
  });

  it("requireNonEmptyCommunityWorkspaceForServerComponent は community があれば workspace を返す", async () => {
    requireCurrentAppUserForServerComponent.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "集金 太郎",
    });
    resolveCurrentCommunityForServerComponent.mockResolvedValue({
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
        slug: "board-games",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      ownedCommunities: [
        {
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      requestedCommunityId: "community-1",
      resolvedBy: "cookie",
    });

    const { requireNonEmptyCommunityWorkspaceForServerComponent } = await loadAppWorkspaceModule();

    await expect(requireNonEmptyCommunityWorkspaceForServerComponent()).resolves.toMatchObject({
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
      },
      hasOwnedCommunities: true,
      isCommunityEmptyState: false,
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
