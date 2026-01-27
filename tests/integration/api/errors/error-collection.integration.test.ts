/**
 * エラー収集API統合テスト
 *
 * /api/errors エンドポイントのリクエストからDB保存までのフローを検証
 */

import { NextRequest } from "next/server";

import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";

// モックは他のインポートより前に宣言
jest.mock("@upstash/redis");
jest.mock("@upstash/ratelimit");
jest.mock("@core/logging/deduplication");

// Supabase Service Role用のモッククライアント作成
const mockSupabaseInsert = jest.fn();
const mockSupabaseFrom = jest.fn(() => ({
  insert: mockSupabaseInsert,
}));

// createClientをモック化
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

// @core/security をモック化
jest.mock("@core/security", () => ({
  AdminReason: {
    ERROR_COLLECTION: "error_collection",
  },
  createSecureSupabaseClient: jest.fn(() => ({
    createAuditedAdminClient: jest.fn().mockResolvedValue({
      from: mockSupabaseFrom,
    }),
  })),
}));

describe("エラー収集API統合テスト (/api/errors)", () => {
  // モック関数をテストスコープで定義
  let mockLimit: jest.MockedFunction<any>;
  let errorHandler: any;

  beforeEach(async () => {
    // モジュールをリセット
    jest.resetModules();

    // 環境変数の設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    // モックをクリア
    mockSupabaseInsert.mockClear();
    mockSupabaseFrom.mockClear();

    // デフォルトのモック動作を設定
    mockSupabaseInsert.mockResolvedValue({ error: null, data: [] });

    // レート制限モックの設定（デフォルトは制限にかからない）
    mockLimit = jest.fn().mockResolvedValue({
      success: true,
      remaining: 49,
    });

    // @upstash/ratelimitのモック設定
    const RatelimitMock: any = jest.fn().mockImplementation(() => ({
      limit: mockLimit,
    }));
    RatelimitMock.slidingWindow = jest.fn((tokens: number, window: string) => ({
      type: "slidingWindow",
      tokens,
      window,
    }));

    // @upstash/redisのモック設定
    const RedisMock = {
      fromEnv: jest.fn(() => ({})),
    };

    // モジュールのモックを再設定
    jest.doMock("@upstash/ratelimit", () => ({
      Ratelimit: RatelimitMock,
    }));

    jest.doMock("@upstash/redis", () => ({
      Redis: RedisMock,
    }));

    // モック設定後にルートハンドラーを動的インポート
    const module = await import("@/app/api/errors/route");
    errorHandler = module.POST;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * I-A-01: 正常系 - 新規エラー登録
   */
  test("I-A-01: 正常系 - 新規エラーが正しくDB保存される", async () => {
    // deduplicationモックの設定（新規エラーとして扱う）
    const { shouldLogError } = require("@core/logging/deduplication");
    (shouldLogError as jest.MockedFunction<any>).mockResolvedValue(true);

    // リクエストペイロード
    const payload = {
      error: {
        code: "TEST_ERROR",
        category: "client_error",
        severity: "error",
        title: "Test Error",
        message: "This is a test error message",
      },
      stackTrace: "Error: Test\n    at test.ts:10:5",
      user: {
        id: "test-user-id",
        email: "test@example.com",
        userAgent: "test-agent",
      },
      page: {
        url: "https://example.com/test",
        pathname: "/test",
        referrer: "https://example.com",
      },
      breadcrumbs: [],
      environment: "test",
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.168.1.1",
      },
      body: JSON.stringify(payload),
    });

    // APIハンドラー実行
    const response = await errorHandler(request);

    // レスポンス検証
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    // DB insert が呼ばれたことを検証
    expect(mockSupabaseInsert).toHaveBeenCalledTimes(1);
    const insertArgs = mockSupabaseInsert.mock.calls[0][0];

    // insert の引数を検証
    expect(insertArgs).toMatchObject({
      log_level: "error",
      log_category: "client_error",
      actor_type: "user",
      actor_identifier: "test@example.com",
      user_id: "test-user-id",
      action: "client_error",
      message: "This is a test error message",
      outcome: "failure",
      error_code: "TEST_ERROR",
      error_message: "This is a test error message",
      error_stack: "Error: Test\n    at test.ts:10:5",
    });
    expect(insertArgs.metadata).toMatchObject({
      error_info: payload.error,
      page: payload.page,
      breadcrumbs: [],
      environment: "test",
    });
    expect(insertArgs.tags).toContain("client_error");
    expect(insertArgs.tags).toContain("severity:error");
  });

  /**
   * I-A-02: 正常系 - 重複エラーのデデュプリケーション
   */
  test("I-A-02: 正常系 - 重複エラーはDB保存されない", async () => {
    // deduplicationモックの設定（重複エラーとして扱う）
    const { shouldLogError } = require("@core/logging/deduplication");
    (shouldLogError as jest.MockedFunction<any>).mockResolvedValue(false);

    // リクエストペイロード
    const payload = {
      error: {
        message: "Duplicate error message",
      },
      stackTrace: "Error: Duplicate\n    at test.ts:20:5",
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.168.1.1",
      },
      body: JSON.stringify(payload),
    });

    // APIハンドラー実行
    const response = await errorHandler(request);

    // レスポンス検証
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true, deduplicated: true });

    // DB insert が呼ばれていないことを検証
    expect(mockSupabaseInsert).not.toHaveBeenCalled();
  });

  /**
   * I-A-03: バリデーションエラー
   */
  test("I-A-03: バリデーションエラー - 必須項目が欠けている", async () => {
    // 不正なペイロード（messageが欠けている）
    const invalidPayload = {
      error: {
        code: "TEST_ERROR",
        // message が欠けている
      },
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.168.1.1",
      },
      body: JSON.stringify(invalidPayload),
    });

    // APIハンドラー実行
    const response = await errorHandler(request);

    // レスポンス検証
    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData).toEqual({ error: "Invalid request body" });

    // DB insert が呼ばれていないことを検証
    expect(mockSupabaseInsert).not.toHaveBeenCalled();
  });

  /**
   * I-A-04: レート制限発動
   */
  test("I-A-04: レート制限発動 - 429エラーとRetry-Afterヘッダー", async () => {
    // レート制限モックの設定（制限超過）
    mockLimit.mockResolvedValue({
      success: false,
      remaining: 0,
    });

    // リクエストペイロード
    const payload = {
      error: {
        message: "Test error",
      },
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.168.1.1",
      },
      body: JSON.stringify(payload),
    });

    // APIハンドラー実行
    const response = await errorHandler(request);

    // レスポンス検証
    expect(response.status).toBe(429);
    const responseData = await response.json();
    expect(responseData).toEqual({ error: "Too many requests" });

    // ヘッダー検証
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");

    // DB insert が呼ばれていないことを検証
    expect(mockSupabaseInsert).not.toHaveBeenCalled();
  });

  /**
   * I-A-05: IPアドレス取得
   */
  test("I-A-05: IPアドレス取得 - x-forwarded-forから最初のIPを使用", async () => {
    // リクエストペイロード
    const payload = {
      error: {
        message: "Test error",
      },
    };

    // リクエスト作成（複数のIPアドレスを含むx-forwarded-for）
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
      body: JSON.stringify(payload),
    });

    // APIハンドラー実行
    await errorHandler(request);

    // レート制限のキーとして最初のIPアドレスが使用されることを検証
    expect(mockLimit).toHaveBeenCalledWith("error_log_1.2.3.4");
  });

  /**
   * I-A-06: DBエラー時の挙動
   */
  test("I-A-06: DBエラー時の挙動 - 500エラー、エラー詳細は非表示", async () => {
    // deduplicationモックの設定
    const { shouldLogError } = require("@core/logging/deduplication");
    (shouldLogError as jest.MockedFunction<any>).mockResolvedValue(true);

    // DB insertエラーをシミュレート
    mockSupabaseInsert.mockResolvedValue({
      error: {
        message: "Database connection failed",
        details: "Sensitive database error details",
      },
      data: null,
    });

    // リクエストペイロード
    const payload = {
      error: {
        message: "Test error",
      },
    };

    // リクエスト作成
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.168.1.1",
      },
      body: JSON.stringify(payload),
    });

    // APIハンドラー実行
    const response = await errorHandler(request);

    // レスポンス検証
    expect(response.status).toBe(500);
    const responseData = await response.json();

    // エラー詳細が含まれていないことを確認（セキュリティ）
    expect(responseData).toEqual({ error: "Failed to save log" });
    expect(responseData).not.toHaveProperty("details");
    expect(responseData).not.toHaveProperty("message");
    expect(JSON.stringify(responseData)).not.toContain("Database connection failed");
    expect(JSON.stringify(responseData)).not.toContain("Sensitive");

    // Cache-Controlヘッダーの検証
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
