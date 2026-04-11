import { jest } from "@jest/globals";

const mockCookies = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();
const mockCreateServerComponentSupabaseClient = jest.fn();
const mockRequireCurrentUserForServerAction = jest.fn();
const mockRequireCurrentUserForServerComponent = jest.fn();

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn().mockReturnThis(),
  },
}));

jest.mock("next/headers", () => ({
  cookies: mockCookies,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
  createServerComponentSupabaseClient: mockCreateServerComponentSupabaseClient,
}));

jest.mock("@core/auth/auth-utils", () => ({
  requireCurrentUserForServerAction: mockRequireCurrentUserForServerAction,
  requireCurrentUserForServerComponent: mockRequireCurrentUserForServerComponent,
}));

type CurrentCommunityModule = typeof import("@core/community/current-community");
type CommunitiesQueryOptions = {
  data?: Array<{ created_at: string; id: string; name: string; slug: string }>;
  error?: { message: string } | null;
};

function createCookieStore(initialValue?: string | null) {
  const value = initialValue ?? null;

  return {
    delete: jest.fn(),
    get: jest.fn((name: string) => {
      if (name !== "current_community_id" || value === null) {
        return undefined;
      }

      return { name, value };
    }),
    set: jest.fn(),
  };
}

function createSupabaseClientForCommunities(options: CommunitiesQueryOptions = {}) {
  const orderId = jest.fn().mockResolvedValue({
    data: options.data ?? [],
    error: options.error ?? null,
  });
  const orderCreatedAt = jest.fn().mockReturnValue({
    order: orderId,
  });
  const eqIsDeleted = jest.fn().mockReturnValue({
    order: orderCreatedAt,
  });
  const eqCreatedBy = jest.fn().mockReturnValue({
    eq: eqIsDeleted,
  });
  const select = jest.fn().mockReturnValue({
    eq: eqCreatedBy,
  });
  const from = jest.fn().mockReturnValue({
    select,
  });

  return {
    client: {
      from,
    },
    spies: {
      eqCreatedBy,
      eqIsDeleted,
      from,
      orderCreatedAt,
      orderId,
      select,
    },
  };
}

async function loadCurrentCommunityModule(): Promise<CurrentCommunityModule> {
  jest.resetModules();
  jest.unmock("@core/community/current-community");
  let loadedModule: CurrentCommunityModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@core/community/current-community");
  });

  if (!loadedModule) {
    throw new Error("Failed to load current-community module");
  }

  return (
    (loadedModule as CurrentCommunityModule & { default?: CurrentCommunityModule }).default ??
    loadedModule
  );
}

describe("core/community/current-community", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("readCurrentCommunityCookie は current_community_id の値を返す", async () => {
    const cookieStore = createCookieStore("community_1");
    mockCookies.mockResolvedValue(cookieStore);

    const { readCurrentCommunityCookie } = await loadCurrentCommunityModule();

    await expect(readCurrentCommunityCookie()).resolves.toBe("community_1");
    expect(cookieStore.get).toHaveBeenCalledWith("current_community_id");
  });

  it("resolveCurrentCommunityContext は cookie と一致する community を返す", async () => {
    const { client, spies } = createSupabaseClientForCommunities({
      data: [
        {
          created_at: "2026-03-10T00:00:00.000Z",
          id: "community-1",
          name: "A",
          slug: "a",
        },
        {
          created_at: "2026-03-11T00:00:00.000Z",
          id: "community-2",
          name: "B",
          slug: "b",
        },
      ],
    });

    const { resolveCurrentCommunityContext } = await loadCurrentCommunityModule();

    await expect(
      resolveCurrentCommunityContext({
        userId: "user-1",
        supabase: client as any,
        requestedCommunityId: "community-2",
      })
    ).resolves.toEqual({
      success: true,
      data: {
        currentCommunity: {
          createdAt: "2026-03-11T00:00:00.000Z",
          id: "community-2",
          name: "B",
          slug: "b",
        },
        ownedCommunities: [
          {
            createdAt: "2026-03-10T00:00:00.000Z",
            id: "community-1",
            name: "A",
            slug: "a",
          },
          {
            createdAt: "2026-03-11T00:00:00.000Z",
            id: "community-2",
            name: "B",
            slug: "b",
          },
        ],
        requestedCommunityId: "community-2",
        resolvedBy: "cookie",
      },
      meta: undefined,
    });

    expect(spies.from).toHaveBeenCalledWith("communities");
    expect(spies.select).toHaveBeenCalledWith("id, name, slug, created_at");
    expect(spies.eqCreatedBy).toHaveBeenCalledWith("created_by", "user-1");
    expect(spies.eqIsDeleted).toHaveBeenCalledWith("is_deleted", false);
    expect(spies.orderCreatedAt).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(spies.orderId).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("resolveCurrentCommunityContext は query error を DATABASE_ERROR で返す", async () => {
    const { client } = createSupabaseClientForCommunities({
      error: {
        message: "database unavailable",
      },
    });

    const { resolveCurrentCommunityContext } = await loadCurrentCommunityModule();
    const result = await resolveCurrentCommunityContext({
      userId: "user-1",
      supabase: client as any,
      requestedCommunityId: "community-2",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected failure result");
    }

    expect(result.error.name).toBe("AppError");
    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.retryable).toBe(true);
    expect(result.error.userMessage).toBe("コミュニティ情報の取得に失敗しました");
    expect(result.error.details).toEqual({
      operation: "list_owned_communities",
      userId: "user-1",
    });
  });

  it("resolveCurrentCommunityContext は cookie が無いと最古 community にフォールバックする", async () => {
    const { client } = createSupabaseClientForCommunities({
      data: [
        {
          created_at: "2026-03-10T00:00:00.000Z",
          id: "community-1",
          name: "A",
          slug: "a",
        },
        {
          created_at: "2026-03-11T00:00:00.000Z",
          id: "community-2",
          name: "B",
          slug: "b",
        },
      ],
    });

    const { resolveCurrentCommunityContext } = await loadCurrentCommunityModule();

    await expect(
      resolveCurrentCommunityContext({
        userId: "user-1",
        supabase: client as any,
      })
    ).resolves.toMatchObject({
      success: true,
      data: {
        currentCommunity: {
          id: "community-1",
        },
        requestedCommunityId: null,
        resolvedBy: "oldest_fallback",
      },
    });
  });

  it("resolveCurrentCommunityContext は不正 cookie を最古 community にフォールバックする", async () => {
    const { client } = createSupabaseClientForCommunities({
      data: [
        {
          created_at: "2026-03-10T00:00:00.000Z",
          id: "community-1",
          name: "A",
          slug: "a",
        },
      ],
    });

    const { resolveCurrentCommunityContext } = await loadCurrentCommunityModule();

    await expect(
      resolveCurrentCommunityContext({
        userId: "user-1",
        supabase: client as any,
        requestedCommunityId: "community-unknown",
      })
    ).resolves.toMatchObject({
      success: true,
      data: {
        currentCommunity: {
          id: "community-1",
        },
        requestedCommunityId: "community-unknown",
        resolvedBy: "oldest_fallback",
      },
    });
  });

  it("resolveCurrentCommunityContext は community 未作成時に空状態を返す", async () => {
    const { client } = createSupabaseClientForCommunities({
      data: [],
    });

    const { resolveCurrentCommunityContext } = await loadCurrentCommunityModule();

    await expect(
      resolveCurrentCommunityContext({
        userId: "user-1",
        supabase: client as any,
        requestedCommunityId: "community-1",
      })
    ).resolves.toEqual({
      success: true,
      data: {
        currentCommunity: null,
        ownedCommunities: [],
        requestedCommunityId: "community-1",
        resolvedBy: "empty",
      },
      meta: undefined,
    });
  });

  it("setCurrentCommunityCookie は spec 通りの cookie options で書き込む", async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { setCurrentCommunityCookie } = await loadCurrentCommunityModule();

    await setCurrentCommunityCookie("community-1");

    expect(cookieStore.set).toHaveBeenCalledWith("current_community_id", "community-1", {
      httpOnly: true,
      maxAge: 15552000,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("clearCurrentCommunityCookie は期限切れ cookie を設定する", async () => {
    const cookieStore = createCookieStore();
    mockCookies.mockResolvedValue(cookieStore);

    const { clearCurrentCommunityCookie } = await loadCurrentCommunityModule();

    await clearCurrentCommunityCookie();

    expect(cookieStore.set).toHaveBeenCalledWith(
      "current_community_id",
      "",
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
      })
    );
  });

  it("resolveCurrentCommunityForServerComponent は cached wrapper 経由で解決する", async () => {
    const { client } = createSupabaseClientForCommunities({
      data: [
        {
          created_at: "2026-03-10T00:00:00.000Z",
          id: "community-1",
          name: "A",
          slug: "a",
        },
      ],
    });
    const cookieStore = createCookieStore("community-1");

    mockRequireCurrentUserForServerComponent.mockResolvedValue({ id: "user-1" });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);
    mockCookies.mockResolvedValue(cookieStore);

    const { resolveCurrentCommunityForServerComponent } = await loadCurrentCommunityModule();

    await expect(resolveCurrentCommunityForServerComponent()).resolves.toMatchObject({
      currentCommunity: { id: "community-1" },
      resolvedBy: "cookie",
    });

    expect(mockRequireCurrentUserForServerComponent).toHaveBeenCalledTimes(1);
    expect(mockCreateServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
  });
});
