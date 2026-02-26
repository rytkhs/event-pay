import { jest } from "@jest/globals";

type MockCookie = { name: string; value: string; [key: string]: unknown };

function createMockResponse(params?: {
  cookies?: MockCookie[];
  headers?: Array<[string, string]>;
  throwOnCookieSet?: boolean;
}) {
  const cookieStore = [...(params?.cookies ?? [])];
  const headerStore = new Map(params?.headers ?? []);

  const cookies = {
    getAll: jest.fn(() => [...cookieStore]),
    set: jest.fn((nameOrCookie: string | MockCookie, value?: string, options?: object) => {
      if (params?.throwOnCookieSet) {
        throw new Error("response cookie store failed");
      }
      if (typeof nameOrCookie === "string") {
        cookieStore.push({ name: nameOrCookie, value: value ?? "", ...(options ?? {}) });
        return;
      }
      cookieStore.push(nameOrCookie);
    }),
  };

  const headers = {
    set: jest.fn((key: string, value: string) => {
      headerStore.set(key, value);
    }),
    forEach: jest.fn((callback: (value: string, key: string) => void) => {
      headerStore.forEach((value, key) => {
        callback(value, key);
      });
    }),
  };

  return {
    cookies,
    headers,
  };
}

const mockCreateServerClient = jest.fn(() => ({ from: jest.fn() }));
const mockGetSupabaseCookieConfig = jest.fn(() => ({ name: "sb-test-auth-token" }));
const mockNextResponseNext = jest.fn(() =>
  createMockResponse({
    headers: [["x-request-id", "rid-1"]],
  })
);

jest.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

jest.mock("@core/supabase/config", () => ({
  getSupabaseCookieConfig: mockGetSupabaseCookieConfig,
}));

jest.mock("next/server", () => ({
  NextResponse: {
    next: (...args: unknown[]) => mockNextResponseNext(...args),
  },
}));

import { createMiddlewareSupabaseClient } from "@core/supabase/middleware-client";

describe("core/supabase/middleware-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNextResponseNext.mockImplementation(() =>
      createMockResponse({
        headers: [["x-request-id", "rid-1"]],
      })
    );
  });

  it("setAll で request を更新し、最新の response へ cookie を反映する", () => {
    const request = {
      headers: {
        get: jest.fn(() => "existing=1"),
      },
      cookies: {
        getAll: jest.fn(() => [{ name: "existing", value: "1" }]),
        set: jest.fn(),
      },
    };
    const response = createMockResponse({
      headers: [["x-request-id", "rid-1"]],
    });
    const requestHeaders = new Headers({
      "x-request-id": "rid-1",
      "x-nonce": "nonce-1",
      "Content-Security-Policy": "default-src 'self'",
    });

    const { getResponse } = createMiddlewareSupabaseClient({
      request: request as never,
      requestHeaders,
      response: response as never,
      supabaseUrl: "https://test-project.supabase.co",
      supabaseAnonKey: "test-anon-key",
    });

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        getAll: () => Array<{ name: string; value: string }>;
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };

    expect(options.cookies.getAll()).toEqual([{ name: "existing", value: "1" }]);

    options.cookies.setAll([
      { name: "sb-a", value: "v1", options: { path: "/" } },
      { name: "sb-b", value: "v2", options: { path: "/", httpOnly: true } },
    ]);
    expect(options.cookies.getAll()).toEqual([
      { name: "existing", value: "1" },
      { name: "sb-a", value: "v1" },
      { name: "sb-b", value: "v2" },
    ]);

    expect(request.cookies.set).toHaveBeenNthCalledWith(1, "sb-a", "v1");
    expect(request.cookies.set).toHaveBeenNthCalledWith(2, "sb-b", "v2");
    expect(mockNextResponseNext).toHaveBeenCalledWith({
      request: {
        headers: expect.any(Headers),
      },
    });
    const nextCall = mockNextResponseNext.mock.calls.at(-1)?.[0] as {
      request: { headers: Headers };
    };
    expect(nextCall.request.headers.get("cookie")).toBe("existing=1; sb-a=v1; sb-b=v2");

    const latestResponse = getResponse();
    expect(latestResponse.cookies.set).toHaveBeenCalledWith("sb-a", "v1", { path: "/" });
    expect(latestResponse.cookies.set).toHaveBeenCalledWith("sb-b", "v2", {
      path: "/",
      httpOnly: true,
    });
  });

  it("request.cookies.set が失敗しても response.cookies.set は継続する", () => {
    const request = {
      cookies: {
        getAll: jest.fn(() => [{ name: "existing", value: "1" }]),
        set: jest.fn(() => {
          throw new Error("immutable request cookies");
        }),
      },
    };
    const response = createMockResponse();

    const { getResponse } = createMiddlewareSupabaseClient({
      request: request as never,
      requestHeaders: new Headers(),
      response: response as never,
      supabaseUrl: "https://test-project.supabase.co",
      supabaseAnonKey: "test-anon-key",
    });

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        getAll: () => Array<{ name: string; value: string }>;
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };

    expect(() =>
      options.cookies.setAll([{ name: "sb-a", value: "v1", options: { path: "/" } }])
    ).not.toThrow();

    expect(options.cookies.getAll()).toEqual([
      { name: "existing", value: "1" },
      { name: "sb-a", value: "v1" },
    ]);
    const nextCall = mockNextResponseNext.mock.calls.at(-1)?.[0] as {
      request: { headers: Headers };
    };
    expect(nextCall.request.headers.get("cookie")).toBe("existing=1; sb-a=v1");
    expect(getResponse().cookies.set).toHaveBeenCalledWith("sb-a", "v1", { path: "/" });
  });

  it("setAll が複数回呼ばれても cookieStore を保持し、削除も反映する", () => {
    const request = {
      cookies: {
        getAll: jest.fn(() => [{ name: "existing", value: "1" }]),
        set: jest.fn(() => {
          throw new Error("immutable request cookies");
        }),
      },
    };
    const response = createMockResponse();

    createMiddlewareSupabaseClient({
      request: request as never,
      requestHeaders: new Headers(),
      response: response as never,
      supabaseUrl: "https://test-project.supabase.co",
      supabaseAnonKey: "test-anon-key",
    });

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        getAll: () => Array<{ name: string; value: string }>;
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };

    options.cookies.setAll([{ name: "sb-a", value: "v1", options: { path: "/" } }]);
    options.cookies.setAll([{ name: "sb-b", value: "v2", options: { path: "/" } }]);
    options.cookies.setAll([{ name: "sb-a", value: "", options: { path: "/", maxAge: 0 } }]);

    expect(options.cookies.getAll()).toEqual([
      { name: "existing", value: "1" },
      { name: "sb-b", value: "v2" },
    ]);

    const nextCall = mockNextResponseNext.mock.calls.at(-1)?.[0] as {
      request: { headers: Headers };
    };
    expect(nextCall.request.headers.get("cookie")).toBe("existing=1; sb-b=v2");
  });

  it("内部 middleware ヘッダーは previousResponse からコピーしない", () => {
    const request = {
      cookies: {
        getAll: jest.fn(() => [{ name: "existing", value: "1" }]),
        set: jest.fn(),
      },
    };
    const response = createMockResponse({
      headers: [
        ["x-request-id", "rid-1"],
        ["x-middleware-set-cookie", "legacy=1"],
        ["x-middleware-override-headers", "cookie"],
        ["x-middleware-request-cookie", "old=1"],
        ["set-cookie", "legacy=1; Path=/"],
      ],
    });

    const { getResponse } = createMiddlewareSupabaseClient({
      request: request as never,
      requestHeaders: new Headers(),
      response: response as never,
      supabaseUrl: "https://test-project.supabase.co",
      supabaseAnonKey: "test-anon-key",
    });

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };
    options.cookies.setAll([{ name: "sb-a", value: "v1", options: { path: "/" } }]);

    const responseHeaders = getResponse().headers as unknown as { set: jest.Mock };
    const headerSetCalls = responseHeaders.set.mock.calls as Array<[string, string]>;
    expect(headerSetCalls).toContainEqual(["x-request-id", "rid-1"]);
    expect(headerSetCalls).not.toContainEqual(["x-middleware-set-cookie", "legacy=1"]);
    expect(headerSetCalls).not.toContainEqual(["x-middleware-override-headers", "cookie"]);
    expect(headerSetCalls).not.toContainEqual(["x-middleware-request-cookie", "old=1"]);
    expect(headerSetCalls).not.toContainEqual(["set-cookie", "legacy=1; Path=/"]);
  });

  it("response.cookies.set が失敗したらラップして throw する", () => {
    mockNextResponseNext.mockImplementation(() => createMockResponse({ throwOnCookieSet: true }));

    const request = {
      headers: {
        get: jest.fn(() => null),
      },
      cookies: {
        getAll: jest.fn(() => []),
        set: jest.fn(),
      },
    };
    const response = createMockResponse();

    createMiddlewareSupabaseClient({
      request: request as never,
      requestHeaders: new Headers(),
      response: response as never,
      supabaseUrl: "https://test-project.supabase.co",
      supabaseAnonKey: "test-anon-key",
    });

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };

    expect(() =>
      options.cookies.setAll([{ name: "sb-a", value: "v1", options: { path: "/" } }])
    ).toThrow("Failed to set auth cookie on middleware response: response cookie store failed");
  });
});
