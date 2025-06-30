/**
 * @jest-environment node
 */

/**
 * メール確認機能API完全テストスイート
 * TDD 100%品質版 - あらゆるシナリオを網羅
 */

// モック設定（インポート前に設定）
import { jest } from "@jest/globals";

// Mock Supabase
type MockAuthResponse<T = any> = Promise<{
  data: T;
  error: { message: string } | null;
}>;

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn() as jest.MockedFunction<
      () => MockAuthResponse<{ user: any } | { user: null }>
    >,
    verifyOtp: jest.fn() as jest.MockedFunction<
      () => MockAuthResponse<{ user: any } | { user: null }>
    >,
    resend: jest.fn() as jest.MockedFunction<() => MockAuthResponse<any>>,
  },
};

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => mockSupabaseClient),
}));

// Mock rate limiting
type RateLimitResponse = Promise<{
  success: boolean;
  remaining: number;
}>;

const mockRatelimitInstance = {
  limit: jest.fn() as jest.MockedFunction<() => RateLimitResponse>,
};

jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: jest.fn(() => mockRatelimitInstance),
}));

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  ping: jest.fn(),
  incr: jest.fn(),
};

jest.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: jest.fn(() => mockRedis),
  },
}));

// Mock cookies
const mockCookies = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock("next/headers", () => ({
  cookies: jest.fn(() => mockCookies),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/confirm-email/route";
import { POST } from "@/app/api/auth/resend-confirmation/route";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const createTestRequest = (
  url: string,
  method: string = "GET",
  body?: any,
  headers: { [key: string]: string } = {}
) => {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "http://localhost:3000/auth/confirm",
      "Content-Length": body ? JSON.stringify(body).length.toString() : "0",
      "X-Forwarded-For": "192.168.1.1",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
};

describe("🔐 メール確認機能API完全テストスイート", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Supabaseクライアントモックを設定（直接モック関数を上書き）
    (createServerClient as any).mockReturnValue(mockSupabaseClient);
    // デフォルトのモック動作を設定
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });
    mockSupabaseClient.auth.resend.mockResolvedValue({
      data: {},
      error: null,
    });
    mockRatelimitInstance.limit.mockResolvedValue({ success: true, remaining: 10 });
    mockCookies.get.mockReturnValue(undefined);
    mockCookies.set.mockReturnValue(undefined);
    (cookies as any).mockReturnValue(mockCookies);
  });

  describe("📧 メール確認処理API (GET /api/auth/confirm-email)", () => {
    describe("✅ 成功シナリオ", () => {
      test("有効なトークンでメール確認が成功しダッシュボードにリダイレクト", async () => {
        const token = "valid-confirmation-token";
        const email = "test@example.com";

        mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
          data: { user: { id: "user-123", email } },
          error: null,
        });

        const request = createTestRequest(
          `http://localhost:3000/api/auth/confirm-email?token=${token}&email=${email}`
        );
        const response = await GET(request);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
        expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
          email,
          token,
          type: "email",
        });
      });
    });

    describe("❌ エラーシナリオ", () => {
      test("トークンが不足している場合のエラー", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/confirm-email?email=test@example.com"
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("確認トークンまたはメールアドレスが不足しています");
      });

      test("メールアドレスが不足している場合のエラー", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/confirm-email?token=some-token"
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("確認トークンまたはメールアドレスが不足しています");
      });

      test("両方のパラメータが不足している場合のエラー", async () => {
        const request = createTestRequest("http://localhost:3000/api/auth/confirm-email");
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("確認トークンまたはメールアドレスが不足しています");
      });

      test("無効なトークンでエラーが返される", async () => {
        const token = "invalid-token";
        const email = "test@example.com";

        mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid token" },
        });

        const request = createTestRequest(
          `http://localhost:3000/api/auth/confirm-email?token=${token}&email=${email}`
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("無効な確認トークンです");
      });

      test("期限切れトークンで適切なエラーメッセージが返される", async () => {
        const token = "expired-token";
        const email = "test@example.com";

        mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
          data: { user: null },
          error: { message: "Token has expired" },
        });

        const request = createTestRequest(
          `http://localhost:3000/api/auth/confirm-email?token=${token}&email=${email}`
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("確認リンクの有効期限が切れています");
      });

      test("Supabaseサーバーエラーで500エラーが返される", async () => {
        const token = "valid-token";
        const email = "test@example.com";

        mockSupabaseClient.auth.verifyOtp.mockRejectedValue(
          new Error("Database connection failed")
        );

        const request = createTestRequest(
          `http://localhost:3000/api/auth/confirm-email?token=${token}&email=${email}`
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe("サーバーエラーが発生しました");
      });
    });

    describe("🔒 セキュリティテスト", () => {
      test("SQLインジェクション攻撃から保護される", async () => {
        const maliciousToken = "'; DROP TABLE users; --";
        const email = "test@example.com";

        const request = createTestRequest(
          `http://localhost:3000/api/auth/confirm-email?token=${encodeURIComponent(maliciousToken)}&email=${email}`
        );
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("無効な確認トークンです");
        expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
          email,
          token: maliciousToken,
          type: "email",
        });
      });

      test("XSSパラメータが適切に処理される", async () => {
        const maliciousEmail = 'test@example.com<script>alert("xss")</script>';
        const token = "valid-token";

        const request = createTestRequest(
          `http://localhost:3000/api/auth/confirm-email?token=${token}&email=${encodeURIComponent(maliciousEmail)}`
        );
        const response = await GET(request);

        expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
          email: maliciousEmail,
          token,
          type: "email",
        });
      });
    });
  });

  describe("📮 確認メール再送信API (POST /api/auth/resend-confirmation)", () => {
    describe("✅ 成功シナリオ", () => {
      test("有効なメールアドレスで再送信が成功", async () => {
        const email = "test@example.com";

        mockSupabaseClient.auth.resend.mockResolvedValue({
          data: {},
          error: null,
        });

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email }
        );
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.message).toContain("確認メールを再送信しました");
        expect(mockSupabaseClient.auth.resend).toHaveBeenCalledWith({
          type: "signup",
          email,
        });
      });
    });

    describe("❌ バリデーションエラーシナリオ", () => {
      test("無効なメールアドレス形式で拒否される", async () => {
        const invalidEmail = "invalid-email";

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: invalidEmail }
        );
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("有効なメールアドレスを入力してください");
      });

      test("メールアドレスが短すぎる場合のエラー", async () => {
        const shortEmail = "a@b";

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: shortEmail }
        );
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("メールアドレスが短すぎます");
      });

      test("メールアドレスが長すぎる場合のエラー", async () => {
        const longEmail = "a".repeat(250) + "@example.com";

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: longEmail }
        );
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("メールアドレスが長すぎます");
      });

      test("不正なJSONフォーマットでエラーが返される", async () => {
        const request = new NextRequest("http://localhost:3000/api/auth/resend-confirmation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
            "X-Requested-With": "XMLHttpRequest",
            Referer: "http://localhost:3000/auth/confirm",
          },
          body: "invalid json",
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("不正なJSONフォーマットです");
      });
    });

    describe("🔒 セキュリティ・CSRF保護テスト", () => {
      test("OriginヘッダーなしでCSRF保護が発動", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" },
          {
            Origin: "",
            "X-Requested-With": "",
            Referer: "",
          }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toBe("CSRF protection: リクエストが無効です");
      });

      test("不正なOriginでCSRF保護が発動", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" },
          {
            Origin: "http://malicious-site.com",
            "X-Requested-With": "",
            Referer: "",
          }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toBe("CSRF protection: リクエストが無効です");
      });

      test("X-Requested-WithヘッダーなしでCSRF保護が発動", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" },
          {
            "X-Requested-With": "",
          }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toBe("CSRF protection: リクエストが無効です");
      });

      test("XSS攻撃データが適切にバリデーションされる", async () => {
        const maliciousEmail = 'test@example.com<script>alert("xss")</script>';

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: maliciousEmail }
        );
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe("有効なメールアドレスを入力してください");
      });

      test("リクエストサイズ制限（DoS攻撃対策）", async () => {
        const largePayload = "a".repeat(2000);

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com", largeField: largePayload },
          { "Content-Length": "2048" }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(413);
        expect(data.success).toBe(false);
        expect(data.error).toBe("リクエストサイズが大きすぎます");
      });
    });

    describe("⏰ レート制限テスト", () => {
      test("IP別レート制限でブロックされる", async () => {
        mockRatelimitInstance.limit.mockResolvedValueOnce({ success: false, remaining: 0 });

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(data.success).toBe(false);
        expect(data.error).toContain("送信回数の上限に達しました");
      });

      test("メールアドレス別レート制限でブロックされる", async () => {
        // IP制限は通過、メール制限でブロック
        mockRatelimitInstance.limit
          .mockResolvedValueOnce({ success: true, remaining: 5 }) // IP制限通過
          .mockResolvedValueOnce({ success: false, remaining: 0 }); // メール制限ブロック

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(data.success).toBe(false);
        expect(data.error).toContain("このメールアドレスの送信回数上限に達しました");
      });

      test("Supabaseレート制限エラーが適切に処理される", async () => {
        mockSupabaseClient.auth.resend.mockResolvedValue({
          data: null,
          error: { message: "rate limit exceeded" },
        });

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(429);
        expect(data.success).toBe(false);
        expect(data.error).toContain("送信回数の上限に達しました");
      });
    });

    describe("🌐 ヘッダー・レスポンステスト", () => {
      test("セキュリティヘッダーが適切に設定される", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" }
        );

        const response = await POST(request);

        expect(response.headers.get("Content-Type")).toBe("application/json");
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      });

      test("X-Forwarded-Forヘッダーが適切に処理される", async () => {
        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" },
          { "X-Forwarded-For": "192.168.1.100, 192.168.1.1" }
        );

        await POST(request);

        // IPアドレスが最初のものを使用されることを確認
        expect(mockRatelimitInstance.limit).toHaveBeenCalledWith("resend_ip_192.168.1.100");
      });
    });

    describe("⚡ パフォーマンス・タイムアウトテスト", () => {
      test("Supabaseタイムアウトが適切に処理される", async () => {
        // 30秒以上かかるPromiseをモック
        mockSupabaseClient.auth.resend.mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ data: {}, error: null }), 35000);
          });
        });

        const request = createTestRequest(
          "http://localhost:3000/api/auth/resend-confirmation",
          "POST",
          { email: "test@example.com" }
        );

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe(
          "メール送信がタイムアウトしました。時間をおいて再度お試しください。"
        );
      }, 40000);
    });
  });
});
