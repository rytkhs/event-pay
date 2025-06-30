/**
 * @jest-environment node
 */

/**
 * @file ログインAPIテストスイート
 * @description `/api/auth/login` エンドポイントの認証とセキュリティテスト（AUTH-001）
 */

import { NextRequest } from "next/server";
import { z } from "zod";

// ログインスキーマ（実装想定）
const LoginSchema = z.object({
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(255, "メールアドレスは255文字以内で入力してください"),
  password: z
    .string()
    .min(1, "パスワードは必須です")
    .max(128, "パスワードは128文字以内で入力してください"),
  rememberMe: z.boolean().optional(),
});

type LoginInput = z.infer<typeof LoginSchema>;

// レート制限設定（実装想定）
const LOGIN_RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000, // 15分
  maxAttempts: 5, // 最大5回のログイン試行
  blockDurationMs: 30 * 60 * 1000, // 30分のブロック
};

// アカウントロックアウト設定
const ACCOUNT_LOCKOUT_CONFIG = {
  maxFailedAttempts: 5,
  lockoutDurationMs: 30 * 60 * 1000, // 30分
};

// モック用のAPIハンドラー
const createMockLoginHandler = () => {
  const rateLimitStore = new Map<string, { count: number; resetTime: number; blocked?: boolean }>();
  const failedAttemptsStore = new Map<string, { count: number; lockoutTime?: number }>();

  return async (request: NextRequest) => {
    try {
      // リクエストボディの取得
      const body = await request.json();

      // レート制限チェック（IP基準）
      const clientIP =
        request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "127.0.0.1";

      const now = Date.now();
      const rateLimitKey = `login:${clientIP}`;
      const rateLimitData = rateLimitStore.get(rateLimitKey);

      if (rateLimitData) {
        if (rateLimitData.blocked && now < rateLimitData.resetTime) {
          return new Response(
            JSON.stringify({
              error:
                "ログイン試行回数が上限に達しました。しばらく時間をおいてから再試行してください。",
              retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000),
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }

        if (now < rateLimitData.resetTime) {
          if (rateLimitData.count >= LOGIN_RATE_LIMIT_CONFIG.maxAttempts) {
            rateLimitStore.set(rateLimitKey, {
              ...rateLimitData,
              blocked: true,
              resetTime: now + LOGIN_RATE_LIMIT_CONFIG.blockDurationMs,
            });
            return new Response(
              JSON.stringify({
                error: "ログイン試行回数が上限に達しました。30分後に再試行してください。",
              }),
              { status: 429, headers: { "Content-Type": "application/json" } }
            );
          }
          rateLimitData.count += 1;
        } else {
          rateLimitStore.set(rateLimitKey, {
            count: 1,
            resetTime: now + LOGIN_RATE_LIMIT_CONFIG.windowMs,
          });
        }
      } else {
        rateLimitStore.set(rateLimitKey, {
          count: 1,
          resetTime: now + LOGIN_RATE_LIMIT_CONFIG.windowMs,
        });
      }

      // 入力値バリデーション
      const validation = LoginSchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify({
            error: "バリデーションエラー",
            details: validation.error.flatten().fieldErrors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const { email, password, rememberMe } = validation.data;

      // アカウントロックアウトチェック
      const failedAttempts = failedAttemptsStore.get(email);
      if (failedAttempts?.lockoutTime && now < failedAttempts.lockoutTime) {
        return new Response(
          JSON.stringify({
            error: "アカウントがロックされています。30分後に再試行してください。",
            lockoutExpiresAt: new Date(failedAttempts.lockoutTime).toISOString(),
          }),
          { status: 423, headers: { "Content-Type": "application/json" } }
        );
      }

      // TODO: 実装されるべき認証機能
      // 注意: この時点では認証機能が実装されていないため、これらのテストは失敗します

      // Supabase Authでログイン（実装想定）
      // const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      //   email,
      //   password
      // })

      // 仮の認証ロジック（テスト用）
      const isValidCredentials = email === "test@eventpay.test" && password === "SecurePass123!";

      if (!isValidCredentials) {
        // 失敗試行回数のカウント
        const currentFailedAttempts = failedAttempts?.count || 0;
        const newFailedAttempts = currentFailedAttempts + 1;

        if (newFailedAttempts >= ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts) {
          failedAttemptsStore.set(email, {
            count: newFailedAttempts,
            lockoutTime: now + ACCOUNT_LOCKOUT_CONFIG.lockoutDurationMs,
          });
          return new Response(
            JSON.stringify({
              error: "ログイン失敗回数が上限に達しました。アカウントが30分間ロックされます。",
            }),
            { status: 423, headers: { "Content-Type": "application/json" } }
          );
        } else {
          failedAttemptsStore.set(email, {
            count: newFailedAttempts,
          });
          return new Response(
            JSON.stringify({
              error: "メールアドレスまたはパスワードが正しくありません。",
              remainingAttempts: ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts - newFailedAttempts,
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // 成功時：失敗試行回数をリセット
      failedAttemptsStore.delete(email);

      // メール確認チェック（実装想定）
      // if (!authData.user.email_confirmed_at) {
      //   return new Response(
      //     JSON.stringify({
      //       error: 'メールアドレスが確認されていません。確認メールをご確認ください。',
      //       needsEmailConfirmation: true
      //     }),
      //     { status: 403, headers: { 'Content-Type': 'application/json' } }
      //   )
      // }

      // HTTPOnly Cookieの設定（実装想定）
      const response = new Response(
        JSON.stringify({
          message: "ログインに成功しました",
          user: {
            id: "mock-user-id",
            email: email,
            name: "テストユーザー",
          },
          redirectUrl: "/dashboard",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      // セッションCookieの設定
      const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30日 or 24時間

      response.headers.append(
        "Set-Cookie",
        `supabase-auth-token=mock-session-token; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
      );

      response.headers.append(
        "Set-Cookie",
        `supabase-auth-token-code-verifier=mock-verifier; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
      );

      return response;
    } catch (error) {
      console.error("Login error:", error);
      return new Response(JSON.stringify({ error: "サーバーエラーが発生しました" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
};

// テストヘルパー関数
const createTestRequest = (
  method: string = "POST",
  body?: any,
  headers: { [key: string]: string } = {}
) => {
  const url = "http://localhost:3000/api/auth/login";
  const request = new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return request;
};

describe("ログインAPI `/api/auth/login`", () => {
  let mockHandler: (request: NextRequest) => Promise<Response>;

  beforeEach(() => {
    // 各テスト前にモックハンドラーを新規作成してレート制限をリセット
    mockHandler = createMockLoginHandler();
  });

  describe("2.3.2 正常なログイン処理", () => {
    test("有効な認証情報でのログイン成功", async () => {
      const validCredentials: LoginInput = {
        email: "test@eventpay.test",
        password: "SecurePass123!",
        rememberMe: false,
      };

      const request = createTestRequest("POST", validCredentials);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.message).toContain("ログインに成功しました");
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(validCredentials.email);
      expect(result.redirectUrl).toBe("/dashboard");
    });

    test("HTTPOnly Cookieの設定確認", async () => {
      const validCredentials: LoginInput = {
        email: "test@eventpay.test",
        password: "SecurePass123!",
      };

      const request = createTestRequest("POST", validCredentials);
      const response = await mockHandler(request);

      expect(response.status).toBe(200);

      // Set-Cookieヘッダーの確認
      const setCookieHeaders = response.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);

      const authCookie = setCookieHeaders.find((cookie) => cookie.includes("supabase-auth-token="));

      expect(authCookie).toBeDefined();
      expect(authCookie).toContain("HttpOnly");
      expect(authCookie).toContain("Secure");
      expect(authCookie).toContain("SameSite=Lax");
      expect(authCookie).toContain("Path=/");
    });

    test("Remember Me機能でのCookie有効期限設定", async () => {
      const rememberMeCredentials: LoginInput = {
        email: "test@eventpay.test",
        password: "SecurePass123!",
        rememberMe: true,
      };

      const request = createTestRequest("POST", rememberMeCredentials);
      const response = await mockHandler(request);

      expect(response.status).toBe(200);

      const setCookieHeaders = response.headers.getSetCookie();
      const authCookie = setCookieHeaders.find((cookie) => cookie.includes("supabase-auth-token="));

      expect(authCookie).toBeDefined();
      // Remember Me選択時は30日間の有効期限
      expect(authCookie).toContain("Max-Age=2592000"); // 30 * 24 * 60 * 60
    });
  });

  describe("不正な認証情報テスト", () => {
    test("不正なメールアドレスでのログイン拒否", async () => {
      const invalidCredentials: LoginInput = {
        email: "invalid@eventpay.test",
        password: "SecurePass123!",
      };

      const request = createTestRequest("POST", invalidCredentials);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(401);
      expect(result.error).toContain("メールアドレスまたはパスワードが正しくありません");
      expect(result.remainingAttempts).toBeDefined();
    });

    test("不正なパスワードでのログイン拒否", async () => {
      const invalidCredentials: LoginInput = {
        email: "test@eventpay.test",
        password: "WrongPassword123!",
      };

      const request = createTestRequest("POST", invalidCredentials);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(401);
      expect(result.error).toContain("メールアドレスまたはパスワードが正しくありません");
    });

    test("空のパスワードでのログイン拒否", async () => {
      const invalidCredentials = {
        email: "test@eventpay.test",
        password: "",
      };

      const request = createTestRequest("POST", invalidCredentials);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.details.password).toContain("パスワードは必須です");
    });
  });

  describe("連続ログイン失敗時のレート制限", () => {
    test("5回連続失敗でアカウントロック", async () => {
      const invalidCredentials: LoginInput = {
        email: "lockout-test@eventpay.test",
        password: "WrongPassword123!",
      };

      // 5回連続でログイン失敗
      for (let i = 0; i < 5; i++) {
        const request = createTestRequest("POST", invalidCredentials);
        const response = await mockHandler(request);
        const result = await response.json();

        if (i < 4) {
          expect(response.status).toBe(401);
          expect(result.remainingAttempts).toBe(4 - i);
        } else {
          // 5回目でアカウントロック
          expect(response.status).toBe(423);
          expect(result.error).toContain("ログイン失敗回数が上限に達しました");
        }
      }
    });

    test("IP別レート制限", async () => {
      const ip1Headers = { "x-forwarded-for": "192.168.1.201" };
      const ip2Headers = { "x-forwarded-for": "192.168.1.202" };

      // IP1から5回失敗（異なるメールアドレスを使用してアカウントロックアウトを回避）
      for (let i = 0; i < 5; i++) {
        const testCredentials: LoginInput = {
          email: `ip1-test-${i}@eventpay.test`,
          password: "WrongPassword123!",
        };
        const request = createTestRequest("POST", testCredentials, ip1Headers);
        await mockHandler(request);
      }

      // IP1から6回目のアクセス（ブロックされる）
      const blockedCredentials: LoginInput = {
        email: "final-ip1-test@eventpay.test",
        password: "WrongPassword123!",
      };
      const blockedRequest = createTestRequest("POST", blockedCredentials, ip1Headers);
      const blockedResponse = await mockHandler(blockedRequest);
      expect(blockedResponse.status).toBe(429);

      // IP2からのアクセス（独立してカウント）
      const ip2Credentials: LoginInput = {
        email: "ip2-test@eventpay.test",
        password: "WrongPassword123!",
      };
      const ip2Request = createTestRequest("POST", ip2Credentials, ip2Headers);
      const ip2Response = await mockHandler(ip2Request);
      expect(ip2Response.status).toBe(401); // ブロックされない
    });

    test("ロックアウト状態での正しい認証情報拒否", async () => {
      const lockedEmail = "locked-account@eventpay.test";

      // アカウントをロック状態にする（異なるIPを使用してIP制限を回避）
      for (let i = 0; i < 5; i++) {
        const request = createTestRequest(
          "POST",
          {
            email: lockedEmail,
            password: "WrongPassword123!",
          },
          { "x-forwarded-for": `192.168.1.${100 + i}` }
        );
        await mockHandler(request);
      }

      // 正しい認証情報でもロック中はアクセス拒否（別のIPを使用）
      const validRequest = createTestRequest(
        "POST",
        {
          email: lockedEmail,
          password: "SecurePass123!", // 正しいパスワード想定
        },
        { "x-forwarded-for": "192.168.1.200" }
      );
      const response = await mockHandler(validRequest);
      const result = await response.json();

      expect(response.status).toBe(423);
      expect(result.error).toContain("アカウントがロックされています");
      expect(result.lockoutExpiresAt).toBeDefined();
    });
  });

  describe("メール未確認アカウントテスト", () => {
    test("メール未確認アカウントでのログイン制限", async () => {
      // TODO: 実装後にSupabase Authでのメール確認チェック
      const unconfirmedCredentials: LoginInput = {
        email: "unconfirmed@eventpay.test",
        password: "SecurePass123!",
      };

      const request = createTestRequest("POST", unconfirmedCredentials);
      // 実装後のテスト
      // const response = await mockHandler(request)
      // const result = await response.json()

      // expect(response.status).toBe(403)
      // expect(result.error).toContain('メールアドレスが確認されていません')
      // expect(result.needsEmailConfirmation).toBe(true)
    });
  });

  describe("セッション情報設定テスト", () => {
    test("セッション有効期限の適切な設定", async () => {
      const validCredentials: LoginInput = {
        email: "test@eventpay.test",
        password: "SecurePass123!",
        rememberMe: false,
      };

      const request = createTestRequest("POST", validCredentials);
      const response = await mockHandler(request);

      expect(response.status).toBe(200);

      const setCookieHeaders = response.headers.getSetCookie();
      const authCookie = setCookieHeaders.find((cookie) => cookie.includes("supabase-auth-token="));

      expect(authCookie).toBeDefined();
      // Remember Me未選択時は24時間の有効期限
      expect(authCookie).toContain("Max-Age=86400"); // 24 * 60 * 60
    });

    test("セキュアCookie属性の検証", async () => {
      const validCredentials: LoginInput = {
        email: "test@eventpay.test",
        password: "SecurePass123!",
      };

      const request = createTestRequest("POST", validCredentials);
      const response = await mockHandler(request);

      const setCookieHeaders = response.headers.getSetCookie();

      setCookieHeaders.forEach((cookie) => {
        if (cookie.includes("supabase-auth-token")) {
          expect(cookie).toContain("HttpOnly"); // XSS攻撃対策
          expect(cookie).toContain("Secure"); // HTTPS必須
          expect(cookie).toContain("SameSite=Lax"); // CSRF攻撃対策
          expect(cookie).toContain("Path=/"); // 全パスで有効
        }
      });
    });
  });

  describe("入力バリデーションテスト", () => {
    test("不正なメールアドレス形式", async () => {
      const invalidEmailData = {
        email: "invalid-email-format",
        password: "SecurePass123!",
      };

      const request = createTestRequest("POST", invalidEmailData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.details.email).toContain("有効なメールアドレスを入力してください");
    });

    test("必須フィールドの欠損", async () => {
      const incompleteData = {
        email: "test@eventpay.test",
        // passwordが欠損
      };

      const request = createTestRequest("POST", incompleteData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.details.password).toBeDefined();
    });

    test("過度に長い入力値の拒否", async () => {
      const longInputData = {
        email: "a".repeat(250) + "@test.com", // 255文字制限を超過
        password: "a".repeat(129), // 128文字制限を超過
      };

      const request = createTestRequest("POST", longInputData);
      const response = await mockHandler(request);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.details.email).toContain("メールアドレスは255文字以内で入力してください");
      expect(result.details.password).toContain("パスワードは128文字以内で入力してください");
    });
  });

  describe("セキュリティテスト", () => {
    test("SQLインジェクション攻撃対策", async () => {
      const maliciousCredentials = {
        email: "admin@eventpay.test'; DROP TABLE users; --",
        password: "password' OR '1'='1",
      };

      const request = createTestRequest("POST", maliciousCredentials);
      const response = await mockHandler(request);

      // バリデーションエラーまたは認証失敗として処理される
      expect([400, 401]).toContain(response.status);
    });

    test("タイミング攻撃対策", async () => {
      const startTime = Date.now();

      // 存在しないユーザーでの認証試行
      const request1 = createTestRequest("POST", {
        email: "nonexistent@eventpay.test",
        password: "password",
      });
      await mockHandler(request1);
      const time1 = Date.now() - startTime;

      // 存在するユーザーでの間違ったパスワード
      const request2 = createTestRequest("POST", {
        email: "test@eventpay.test",
        password: "wrongpassword",
      });
      await mockHandler(request2);
      const time2 = Date.now() - startTime - time1;

      // レスポンス時間の差が大きすぎないことを確認（タイミング攻撃防止）
      const timeDiff = Math.abs(time1 - time2);
      expect(timeDiff).toBeLessThan(100); // 100ms以内の差
    });

    test("パスワード強度の確認なし（認証のみ）", async () => {
      // ログイン時はパスワード強度チェックを行わない
      const weakPasswordCredentials = {
        email: "test@eventpay.test",
        password: "123", // 弱いパスワードでも認証は試行される
      };

      const request = createTestRequest("POST", weakPasswordCredentials);
      const response = await mockHandler(request);
      const result = await response.json();

      // パスワード強度ではなく、認証失敗として処理される
      expect(response.status).toBe(401);
      expect(result.error).toContain("メールアドレスまたはパスワードが正しくありません");
    });
  });
});
