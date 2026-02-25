import { jest } from "@jest/globals";

const mockCreateServerClient = jest.fn(() => ({ from: jest.fn() }));
const mockGetSupabaseCookieConfig = jest.fn(() => ({ name: "sb-test-auth-token" }));

jest.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

jest.mock("@core/supabase/config", () => ({
  getSupabaseCookieConfig: mockGetSupabaseCookieConfig,
}));

import { createMiddlewareSupabaseClient } from "@core/supabase/middleware-client";

describe("core/supabase/middleware-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("setAll で request/response の両方へ cookie を反映する", () => {
    const request = {
      cookies: {
        getAll: jest.fn(() => [{ name: "existing", value: "1" }]),
        set: jest.fn(),
      },
    };
    const response = {
      cookies: {
        set: jest.fn(),
      },
    };

    createMiddlewareSupabaseClient({
      request: request as never,
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

    expect(request.cookies.set).toHaveBeenNthCalledWith(1, "sb-a", "v1");
    expect(request.cookies.set).toHaveBeenNthCalledWith(2, "sb-b", "v2");
    expect(response.cookies.set).toHaveBeenNthCalledWith(1, "sb-a", "v1", { path: "/" });
    expect(response.cookies.set).toHaveBeenNthCalledWith(2, "sb-b", "v2", {
      path: "/",
      httpOnly: true,
    });
  });

  it("request.cookies.set が失敗したら throw する", () => {
    const request = {
      cookies: {
        getAll: jest.fn(() => []),
        set: jest.fn(() => {
          throw new Error("immutable request cookies");
        }),
      },
    };
    const response = {
      cookies: {
        set: jest.fn(),
      },
    };

    createMiddlewareSupabaseClient({
      request: request as never,
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
    ).toThrow("Failed to set auth cookie on middleware request: immutable request cookies");
    expect(response.cookies.set).not.toHaveBeenCalled();
  });
});
