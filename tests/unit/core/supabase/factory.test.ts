import { jest } from "@jest/globals";

const mockCreateServerClient = jest.fn(() => ({ from: jest.fn() }));
const mockCookies = jest.fn();
const mockGetSupabaseCookieConfig = jest.fn(() => ({ name: "sb-test-auth-token" }));
const mockGetEnv = jest.fn();
const mockHandleServerError = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

jest.mock("next/headers", () => ({
  cookies: mockCookies,
}));

jest.mock("@core/supabase/config", () => ({
  getSupabaseCookieConfig: mockGetSupabaseCookieConfig,
}));

jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: mockGetEnv,
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: mockHandleServerError,
}));

import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";

describe("core/supabase/factory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnv.mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NODE_ENV: "test",
    });
  });

  it("getAll が失敗したらログを残して throw する", async () => {
    const cookieStore = {
      getAll: jest.fn(() => {
        throw new Error("cookie store read failed");
      }),
      set: jest.fn(),
    };
    mockCookies.mockResolvedValue(cookieStore);

    await createServerActionSupabaseClient();

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        getAll: () => Array<{ name: string; value: string }>;
      };
    };

    expect(() => options.cookies.getAll()).toThrow(
      "Supabase server client failed to read auth cookies."
    );
    expect(mockHandleServerError).toHaveBeenCalledWith(
      "INTERNAL_ERROR",
      expect.objectContaining({
        additionalData: expect.objectContaining({
          reason: "COOKIE_READ_FAILED",
          context: "server_action",
        }),
      })
    );
  });

  it("Server Component では setAll 書き込み失敗を無視する", async () => {
    const cookieStore = {
      getAll: jest.fn(() => []),
      set: jest.fn(() => {
        throw new Error("write forbidden in server component");
      }),
    };
    mockCookies.mockResolvedValue(cookieStore);

    await createServerComponentSupabaseClient();

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };

    expect(() =>
      options.cookies.setAll([{ name: "sb-test", value: "v", options: { path: "/" } }])
    ).not.toThrow();
    expect(mockHandleServerError).not.toHaveBeenCalled();
  });

  it("Server Action では setAll 書き込み失敗を throw する", async () => {
    const cookieStore = {
      getAll: jest.fn(() => []),
      set: jest.fn(() => {
        throw new Error("write failed");
      }),
    };
    mockCookies.mockResolvedValue(cookieStore);

    await createServerActionSupabaseClient();

    const options = mockCreateServerClient.mock.calls[0][2] as {
      cookies: {
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: object }>) => void;
      };
    };

    expect(() =>
      options.cookies.setAll([{ name: "sb-test", value: "v", options: { path: "/" } }])
    ).toThrow(
      "Supabase server client failed to write auth cookies. Ensure this runs in a Route Handler or Server Action."
    );
    expect(mockHandleServerError).toHaveBeenCalledWith(
      "INTERNAL_ERROR",
      expect.objectContaining({
        additionalData: expect.objectContaining({
          reason: "COOKIE_WRITE_FAILED",
          context: "server_action",
        }),
      })
    );
  });
});
