const mockCreateClient = jest.fn(() => ({ from: jest.fn() }));
const mockCreateServerClient = jest.fn(() => ({ from: jest.fn() }));
const mockGetEnv = jest.fn();
const mockHandleServerError = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

jest.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
}));

jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: mockGetEnv,
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: mockHandleServerError,
}));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    withContext: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

describe("SecureSupabaseClientFactory.createGuestClient", () => {
  const validGuestToken = "gst_12345678901234567890123456789012";

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnv.mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      NODE_ENV: "test",
    });
  });

  it("createClient を使用し、ゲストヘッダーを付与して非永続セッションを固定する", () => {
    const actualModule = jest.requireActual("@core/security/secure-client-factory.impl");
    const factory = new actualModule.SecureSupabaseClientFactory();

    factory.createGuestClient(validGuestToken, {
      persistSession: true,
      autoRefreshToken: true,
      headers: { "x-custom-header": "custom-value" },
    });

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: expect.objectContaining({
            "x-guest-token": validGuestToken,
            "x-custom-header": "custom-value",
          }),
        },
      })
    );
  });

  it("無効なトークン形式では GuestTokenError を投げる", () => {
    const actualModule = jest.requireActual("@core/security/secure-client-factory.impl");
    const factory = new actualModule.SecureSupabaseClientFactory();

    expect(() => factory.createGuestClient("invalid-token")).toThrow("Invalid guest token format");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
