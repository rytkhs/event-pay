import { jest } from "@jest/globals";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const mockCreateServerActionSupabaseClient = jest.fn();
const mockCreateServerComponentSupabaseClient = jest.fn();
const mockHeaders = jest.fn();
const mockHandleServerError = jest.fn();
const mockRedirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
  createServerComponentSupabaseClient: mockCreateServerComponentSupabaseClient,
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: mockHandleServerError,
}));

jest.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

jest.mock("next/headers", () => ({
  headers: mockHeaders,
}));

type AuthUtilsModule = typeof import("@core/auth/auth-utils");

type MockLookupOptions = {
  authError?: unknown;
  profile?: { email?: string | null; name?: string | null } | null;
  profileError?: unknown;
  user?: { id: string; email?: string | null } | null;
};

function createLookupClient(options: MockLookupOptions = {}) {
  const authGetUser = jest.fn().mockResolvedValue({
    data: {
      user:
        options.user === null
          ? null
          : ({
              id: options.user?.id ?? "user_1",
              email: options.user?.email ?? "user@example.com",
            } as any),
    },
    error: options.authError ?? null,
  });
  const maybeSingle = jest.fn().mockResolvedValue({
    data: options.profile ?? null,
    error: options.profileError ?? null,
  });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });

  return {
    client: {
      auth: {
        getUser: authGetUser,
      },
      from,
    },
    spies: {
      authGetUser,
      from,
      select,
      eq,
      maybeSingle,
    },
  };
}

async function loadAuthUtils(): Promise<AuthUtilsModule> {
  jest.resetModules();
  jest.unmock("@core/auth/auth-utils");
  let loadedModule: AuthUtilsModule | undefined;
  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("@core/auth/auth-utils");
  });
  if (!loadedModule) {
    throw new Error("Failed to load auth-utils module");
  }
  return (loadedModule as AuthUtilsModule & { default?: AuthUtilsModule }).default ?? loadedModule;
}

describe("core/auth/auth-utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("requireCurrentAppUserForServerComponent は profile の name を優先する", async () => {
    const { client } = createLookupClient({
      profile: { name: "集金 太郎", email: "profile@example.com" },
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);

    const { requireCurrentAppUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentAppUserForServerComponent()).resolves.toEqual({
      id: "user_1",
      email: "profile@example.com",
      name: "集金 太郎",
    });
  });

  it("profile が無い場合は email を name fallback に使う", async () => {
    const { client } = createLookupClient({
      profile: null,
      user: { id: "user_2", email: "fallback@example.com" },
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);

    const { requireCurrentAppUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentAppUserForServerComponent()).resolves.toEqual({
      id: "user_2",
      email: "fallback@example.com",
      name: "fallback@example.com",
    });
  });

  it("auth error 時は requireCurrentUserForServerComponent が throw する", async () => {
    const { client } = createLookupClient({
      authError: new Error("Authentication error"),
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);

    const { requireCurrentUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentUserForServerComponent()).rejects.toThrow(
      "Failed to resolve authenticated user from Supabase Auth."
    );
    expect(mockHandleServerError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "current_user_lookup_failed",
        additionalData: { context: "server_component" },
      })
    );
  });

  it("セッション欠如時は requireCurrentUserForServerComponent が /login に redirect する", async () => {
    const { client } = createLookupClient({
      authError: new AuthSessionMissingError(),
      user: null,
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);
    mockHeaders.mockResolvedValue(
      new Headers({
        "x-pathname": "/settings/profile",
      })
    );

    const { requireCurrentUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentUserForServerComponent()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockHandleServerError).not.toHaveBeenCalled();
  });

  it("未認証時は requireCurrentAppUserForServerComponent が /login に redirect する", async () => {
    const { client } = createLookupClient({
      user: null,
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);
    mockHeaders.mockResolvedValue(
      new Headers({
        "x-pathname": "/events/create",
      })
    );

    const { requireCurrentAppUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentAppUserForServerComponent()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockHandleServerError).not.toHaveBeenCalled();
  });

  it("x-pathname が無い場合は /login に redirect する", async () => {
    const { client } = createLookupClient({
      user: null,
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);
    mockHeaders.mockResolvedValue(new Headers());

    const { requireCurrentUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentUserForServerComponent()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("requireCurrentUserForServerComponent は server component の user を返す", async () => {
    const { client, spies } = createLookupClient();
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);

    const { requireCurrentUserForServerComponent } = await loadAuthUtils();

    await expect(requireCurrentUserForServerComponent()).resolves.toMatchObject({
      id: "user_1",
      email: "user@example.com",
    });

    expect(mockCreateServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(spies.authGetUser).toHaveBeenCalledTimes(1);
  });

  it("getOptionalCurrentUserForServerComponent はセッション欠如を null として扱う", async () => {
    const { client } = createLookupClient({
      authError: new AuthSessionMissingError(),
      user: null,
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);

    const { getOptionalCurrentUserForServerComponent } = await loadAuthUtils();

    await expect(getOptionalCurrentUserForServerComponent()).resolves.toBeNull();
    expect(mockHandleServerError).not.toHaveBeenCalled();
  });

  it("requireCurrentAppUserForServerComponent は users.name,email を問い合わせる", async () => {
    const { client, spies } = createLookupClient({
      profile: { name: "共有ユーザー", email: "shared@example.com" },
    });
    mockCreateServerComponentSupabaseClient.mockResolvedValue(client);

    const { requireCurrentAppUserForServerComponent } = await loadAuthUtils();

    await requireCurrentAppUserForServerComponent();

    expect(mockCreateServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(spies.authGetUser).toHaveBeenCalledTimes(1);
    expect(spies.from).toHaveBeenCalledWith("users");
    expect(spies.select).toHaveBeenCalledWith("name, email");
    expect(spies.eq).toHaveBeenCalledWith("id", "user_1");
    expect(spies.maybeSingle).toHaveBeenCalledTimes(1);
  });
});
