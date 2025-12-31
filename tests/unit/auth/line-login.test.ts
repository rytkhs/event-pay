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
    warn: jest.fn(),
    withContext: jest.fn().mockReturnThis(),
  },
}));

// Supabase関連のモック
const mockSupabaseAdmin = {
  from: jest.fn(),
  auth: {
    admin: {
      createUser: jest.fn(),
      generateLink: jest.fn(),
      getUserById: jest.fn(),
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

// Cloudflare Contextのモック
jest.mock("@core/utils/cloudflare-ctx", () => ({
  waitUntil: jest.fn((promise: Promise<unknown>) => {
    // テスト内では実行を完結させる必要がなければ何もしない
    // 必要なら promise を await する
  }),
}));

// queueMicrotaskのモック (念のため残すが、waitUntilに移行済み)
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
      expect(location).toContain("nonce=");

      // Cookieにstateがセットされたか確認
      expect(mockCookies.set).toHaveBeenCalledWith(
        "line_oauth_state",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          path: "/",
        })
      );
      expect(mockCookies.set).toHaveBeenCalledWith(
        "line_oauth_nonce",
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
    const mockChannelId = "test-channel-id";

    beforeEach(() => {
      // デフォルトでstate検証が通るように設定
      mockCookies.get.mockImplementation((name) => {
        if (name === "line_oauth_state") return { value: mockState };
        if (name === "line_oauth_next") return { value: "/dashboard" };
        if (name === "line_oauth_nonce") return { value: "test-nonce" };
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

    it("should redirect to error page if nonce is missing", async () => {
      mockCookies.get.mockImplementation((name) => {
        if (name === "line_oauth_state") return { value: mockState };
        // nonce is missing
        return undefined;
      });
      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(
        "http://localhost:3000/login?error=line_state_mismatch"
      );
    });

    it("should successfully login existing LINE user (linked in line_accounts)", async () => {
      const lineSub = "line-user-123";
      const userId = "existing-user-id";

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
            sub: lineSub,
            name: "Test User",
            picture: "http://example.com/pic.jpg",
          }),
        });

      // line_accountsテーブルから既存の紐付けを返す
      const mockLineAccountsSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { auth_user_id: userId },
          error: null,
        }),
      };

      const mockLineAccountsUpdate = {
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
      };

      mockSupabaseAdmin.from.mockImplementation((table) => {
        if (table === "line_accounts") {
          return {
            select: jest.fn().mockReturnValue(mockLineAccountsSelect),
            update: jest.fn((data) => {
              mockLineAccountsUpdate.update(data);
              return mockLineAccountsUpdate;
            }),
          };
        }
        return { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
      });

      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: { user: { id: userId, email: "test@example.com" } },
        error: null,
      });

      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: "mock-hash" } },
        error: null,
      });

      mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
        data: { session: { user: { id: userId } } },
        error: null,
      });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      // 検証 - line_accountsテーブルから検索されたか
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("line_accounts");
      expect(mockLineAccountsSelect.eq).toHaveBeenCalledWith("channel_id", mockChannelId);
      expect(mockLineAccountsSelect.eq).toHaveBeenCalledWith("line_sub", lineSub);

      // プロフィール情報が更新されたか
      expect(mockLineAccountsUpdate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          display_name: "Test User",
          picture_url: "http://example.com/pic.jpg",
        })
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    });

    it("should link existing email user with new LINE account", async () => {
      const lineSub = "line-user-new";
      const email = "test@example.com";
      const existingUserId = "existing-user-id";

      // LINE API Mocks
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: "mock-id-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email,
            sub: lineSub,
            name: "Test User",
            picture: "http://example.com/pic.jpg",
          }),
        });

      // line_accountsテーブルで見つからない
      const mockLineAccountsSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      };

      // public.usersテーブルで既存ユーザーが見つかる
      const mockUsersSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: existingUserId },
          error: null,
        }),
      };

      const mockLineAccountsInsert = jest.fn().mockResolvedValue({
        data: {},
        error: null,
      });

      mockSupabaseAdmin.from.mockImplementation((table) => {
        if (table === "line_accounts") {
          return {
            select: jest.fn().mockReturnValue(mockLineAccountsSelect),
            insert: mockLineAccountsInsert,
          };
        }
        if (table === "users") {
          return {
            select: jest.fn().mockReturnValue(mockUsersSelect),
          };
        }
        return { select: jest.fn(), insert: jest.fn() };
      });

      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: { user: { id: existingUserId, email } },
        error: null,
      });

      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: "mock-hash" } },
        error: null,
      });

      mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
        data: { session: { user: { id: existingUserId } } },
        error: null,
      });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      // 検証
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("line_accounts");
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(mockUsersSelect.eq).toHaveBeenCalledWith("email", email);

      // line_accountsに紐付けが作成されたか
      expect(mockLineAccountsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          auth_user_id: existingUserId,
          channel_id: mockChannelId,
          line_sub: lineSub,
          email,
        })
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    });

    it("should successfully register new user with LINE", async () => {
      const lineSub = "line-user-new";
      const email = "new@example.com";
      const newUserId = "new-user-id";

      // LINE API Mocks
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: "mock-id-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email,
            sub: lineSub,
            name: "New User",
            picture: "http://example.com/pic.jpg",
          }),
        });

      // line_accountsテーブルで見つからない
      const mockLineAccountsSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      };

      // public.usersテーブルでも見つからない
      const mockUsersSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      };

      const mockLineAccountsInsert = jest.fn().mockResolvedValue({
        data: {},
        error: null,
      });

      mockSupabaseAdmin.from.mockImplementation((table) => {
        if (table === "line_accounts") {
          return {
            select: jest.fn().mockReturnValue(mockLineAccountsSelect),
            insert: mockLineAccountsInsert,
          };
        }
        if (table === "users") {
          return {
            select: jest.fn().mockReturnValue(mockUsersSelect),
          };
        }
        return { select: jest.fn(), insert: jest.fn() };
      });

      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: newUserId } },
        error: null,
      });

      mockSupabaseAdmin.auth.admin.getUserById.mockResolvedValue({
        data: { user: { id: newUserId, email } },
        error: null,
      });

      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: "mock-hash" } },
        error: null,
      });

      mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
        data: { session: { user: { id: newUserId } } },
        error: null,
      });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      // 検証 - 新規ユーザーが作成されたか
      expect(mockSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          email_confirm: true,
          user_metadata: expect.objectContaining({
            provider: "line",
            line_user_id: lineSub,
          }),
        })
      );

      // line_accountsに紐付けが作成されたか
      expect(mockLineAccountsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          auth_user_id: newUserId,
          channel_id: mockChannelId,
          line_sub: lineSub,
          email,
        })
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    });

    it("should redirect to login with error when sub is missing from LINE profile", async () => {
      // LINE API Mocks - subがnullの場合
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: "mock-id-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            email: "test@example.com",
            name: "Test User",
            picture: "http://example.com/pic.jpg",
            // subがない
          }),
        });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(
        "http://localhost:3000/login?error=line_auth_failed"
      );
    });

    it("should redirect to login with email_required error when email is missing for new user", async () => {
      const lineSub = "line-user-123";

      // LINE API Mocks - emailがnullの場合
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id_token: "mock-id-token" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: lineSub,
            name: "Test User",
            picture: "http://example.com/pic.jpg",
            // emailがない
          }),
        });

      // line_accountsテーブルで見つからない
      const mockLineAccountsSelect = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      };

      mockSupabaseAdmin.from.mockImplementation((table) => {
        if (table === "line_accounts") {
          return {
            select: jest.fn().mockReturnValue(mockLineAccountsSelect),
          };
        }
        return { select: jest.fn() };
      });

      const request = new Request(
        `http://localhost:3000/auth/callback/line?code=${mockCode}&state=${mockState}`
      );
      const response = await authCallbackLineGet(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(
        "http://localhost:3000/login?error=line_email_required"
      );
    });
  });
});
