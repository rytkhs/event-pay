import { jest } from "@jest/globals";
import { AuthApiError } from "@supabase/supabase-js";

type MockCookie = { name: string; value: string; [key: string]: unknown };

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

class MockNextResponse {
  body: unknown;
  status: number;
  headers: Headers;
  cookies: {
    getAll: () => MockCookie[];
    set: (cookieOrName: MockCookie | string, value?: string) => void;
  };

  private cookieStore: MockCookie[] = [];

  constructor(body: unknown = null, init: ResponseInit = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers);
    this.cookies = {
      getAll: jest.fn(() => [...this.cookieStore]),
      set: jest.fn((cookieOrName: MockCookie | string, value?: string) => {
        if (typeof cookieOrName === "string") {
          this.cookieStore.push({ name: cookieOrName, value: value ?? "" });
          return;
        }
        this.cookieStore.push(cookieOrName);
      }),
    };
  }

  static next(init: { request?: { headers?: Headers }; status?: number } = {}) {
    return new MockNextResponse(null, { status: init.status ?? 200 });
  }

  static redirect(url: URL | string, init: ResponseInit = {}) {
    return new MockNextResponse(null, {
      ...init,
      status: init.status ?? 307,
      headers: {
        Location: String(url),
        ...toHeaderRecord(init.headers),
      },
    });
  }

  static json(body: unknown, init: ResponseInit = {}) {
    return new MockNextResponse(body, {
      ...init,
      status: init.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        ...toHeaderRecord(init.headers),
      },
    });
  }
}

const mockGetClaims = jest.fn();
const mockGetUser = jest.fn();
const mockSignOut = jest.fn();
const mockGetResponse = jest.fn();
const mockCreateMiddlewareSupabaseClient = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: MockNextResponse,
}));

jest.mock("@core/supabase/middleware-client", () => ({
  createMiddlewareSupabaseClient: mockCreateMiddlewareSupabaseClient,
}));

type MiddlewareModule = typeof import("../../middleware");

function createRequest(pathname: string) {
  return {
    headers: new Headers({ "x-request-id": "rid-1" }),
    nextUrl: new URL(`https://example.com${pathname}`),
    url: `https://example.com${pathname}`,
    cookies: {
      getAll: jest.fn(() => []),
      set: jest.fn(),
    },
  };
}

async function loadMiddleware(): Promise<MiddlewareModule> {
  jest.resetModules();
  let loadedModule: MiddlewareModule | undefined;

  await jest.isolateModulesAsync(async () => {
    loadedModule = await import("../../middleware");
  });

  if (!loadedModule) {
    throw new Error("Failed to load middleware module");
  }

  return loadedModule;
}

describe("middleware auth redirects", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.NEXT_PUBLIC_IS_DEMO = "false";

    mockGetClaims.mockResolvedValue({ data: { claims: null }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockGetResponse.mockImplementation(() => new MockNextResponse());
    mockCreateMiddlewareSupabaseClient.mockImplementation(() => ({
      supabase: {
        auth: {
          getClaims: mockGetClaims,
          getUser: mockGetUser,
          signOut: mockSignOut,
        },
      },
      getResponse: mockGetResponse,
    }));
  });

  it("protected route で claims が無ければ login に redirect する", async () => {
    const { middleware } = await loadMiddleware();

    const response = await middleware(createRequest("/dashboard") as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?redirectTo=%2Fdashboard"
    );
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("protected route で claims があれば getUser せず通す", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "user_1" } }, error: null });
    const { middleware } = await loadMiddleware();

    const response = await middleware(createRequest("/dashboard") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("/login で claims が無ければ login page を表示する", async () => {
    const { middleware } = await loadMiddleware();

    const response = await middleware(createRequest("/login") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("/login で claims と user があれば dashboard に redirect する", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "user_1" } }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });
    const { middleware } = await loadMiddleware();

    const response = await middleware(createRequest("/login") as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/dashboard");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("/login で claims があっても user_not_found なら signOut して login page を表示する", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "user_1" } }, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found"),
    });
    const { middleware } = await loadMiddleware();

    const response = await middleware(createRequest("/login") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("/login で getUser が非未認証エラーなら signOut せず login page を表示する", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "user_1" } }, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("temporary auth api failure"),
    });
    const { middleware } = await loadMiddleware();

    const response = await middleware(createRequest("/login") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
