import { GET as authCallbackLineGet } from "@/app/auth/callback/line/route";
import { GET as authLineGet } from "@/app/auth/line/route";

// next/headersのモックはjest.config.mjsで自動的に適用されるが、
// 個別のテストケースで振る舞いを変えるためにここで再定義して制御可能にする
const mockCookies = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockHeaders = {
  get: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: () => mockCookies,
  headers: () => mockHeaders,
}));

// Cloudflare環境変数のモック
// jest-setup.tsでdotenvが読み込まれるが、テスト用に特定の値を設定
jest.mock("@core/utils/cloudflare-env", () => ({
  getEnv: jest.fn(() => ({
    NEXT_PUBLIC_LINE_CHANNEL_ID: "test-channel-id",
    LINE_CHANNEL_SECRET: "test-channel-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NODE_ENV: "test",
  })),
}));

// ロガーのモック
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// Supabase関連のモック
const mockSupabaseAdmin = {
  from: jest.fn(),
  auth: {
    admin: {
      updateUserById: jest.fn(),
      createUser: jest.fn(),
      generateLink: jest.fn(),
    },
  },
};

const mockSupabaseClient = {
  auth: {
    verifyOtp: jest.fn(),
  },
};

jest.mock("@core/security/secure-client-factory.impl", () => ({
  getSecureClientFactory: () => ({
    createAuditedAdminClient: jest.fn().mockResolvedValue(mockSupabaseAdmin),
    createAuthenticatedClient: jest.fn().mockReturnValue(mockSupabaseClient),
  }),
}));

// GA4関連のモック
jest.mock("@core/utils/ga-cookie", () => ({
  extractClientIdFromGaCookie: jest.fn(),
}));

// queueMicrotaskのモック
global.queueMicrotask = jest.fn((fn) => {
  // テスト内では実行しない
});

describe("LINE Login Auth Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.get.mockReturnValue(null); // Default headers
  });

  describe("GET /auth/line", () => {
    it("should redirect to LINE authorization URL with correct params", async () => {
      const request = new Request("http://localhost:3000/auth/line");
      const response = await authLineGet(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("Location");
      expect(location).toContain("https://access.line.me/oauth2/v2.1/authorize");
      expect(location).toContain("client_id=test-channel-id");
      expect(location).toContain(
        "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%2Fline"
      );
      expect(location).toContain("scope=profile+openid+email");
      expect(location).toContain("state=");

      // Cookieにstateがセットされたか確認
      expect(mockCookies.set).toHaveBeenCalledWith(
        "line_oauth_state",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          path: "/",
          maxAge: 600,
        })
      );
    });

    it("should handle 'next' parameter", async () => {
      const request = new Request("http://localhost:3000/auth/line?next=/events/123");
      await authLineGet(request);

      expect(mockCookies.set).toHaveBeenCalledWith(
        "line_oauth_next",
        "/events/123",
        expect.anything()
      );
    });
  });

  describe("GET /auth/callback/line", () => {
    const mockState = "test-state";
    const mockCode = "test-code";

    beforeEach(() => {
      // デフォルトでstate検証が通るように設定
      mockCookies.get.mockImplementation((name) => {
        if (name === "line_oauth_state") return { value: mockState };
        if (name === "line_oauth_next") return { value: "/dashboard" };
        return undefined;
      });

      // fetchのモック
      global.fetch = jest.fn();
    });

    it("should redirect to error page if error param exists", async () => {
      const request = new Request("http://localhost:3000/auth/callback/line?error=access_denied");
      const response = await authCallbackLineGet(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(
        "http://localhost:3000/login?error=line_auth_failed"
      );
    });

    it("should redirect to error page if state mismatch", async () => {
      mockCookies.get.mockReturnValue({ value: "different-state" });
      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(
        "http://localhost:3000/login?error=line_state_mismatch"
      );
    });

    it("should successfully login existing user", async () => {
      // LINE Token API Mock
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: "mock-id-token", access_token: "mock-access-token" }),
        })
        // LINE Verify API Mock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: "test@example.com",
            sub: "line-user-123",
            name: "Test User",
            picture: "http://example.com/pic.jpg",
          }),
        });

      // Supabase Mocks - public.usersテーブルからの検索をモック
      const mockSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: "existing-user-id", email: "test@example.com" },
          error: null,
        }),
      };
      mockSupabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue(mockSelect),
      });
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({ error: null });
      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: "mock-hash" } },
        error: null,
      });
      mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
        data: { session: { user: { id: "existing-user-id" } } },
        error: null,
      });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      // 検証 - public.usersテーブルから検索されたか
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(mockSelect.eq).toHaveBeenCalledWith("email", "test@example.com");

      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        "existing-user-id",
        expect.objectContaining({
          user_metadata: expect.objectContaining({
            provider: "line",
            line_user_id: "line-user-123",
          }),
        })
      );

      expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          type: "email",
        })
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    });

    it("should successfully register new user", async () => {
      // LINE API Mocks
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: "mock-id-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ email: "new@example.com", sub: "line-user-new", name: "New User" }),
        });

      // Supabase Mocks - public.usersテーブルで見つからない場合のモック
      const mockSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" }, // Not found error
        }),
      };
      mockSupabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue(mockSelect),
      });
      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: "new-user-id" } },
        error: null,
      });
      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: "mock-hash" } },
        error: null,
      });
      mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
        data: { session: { user: { id: "new-user-id" } } },
        error: null,
      });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      // 検証 - public.usersテーブルから検索されたか
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(mockSelect.eq).toHaveBeenCalledWith("email", "new@example.com");

      expect(mockSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@example.com",
          email_confirm: true,
          user_metadata: expect.objectContaining({
            provider: "line",
            line_user_id: "line-user-new",
          }),
        })
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    });
  });
});
