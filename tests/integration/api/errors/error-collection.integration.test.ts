/**
 * エラー収集API統合テスト
 *
 * /api/errors エンドポイントの主要契約を検証
 */

import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

describe("エラー収集API統合テスト (/api/errors)", () => {
  const mockSupabaseInsert = jest.fn();
  const mockSupabaseFrom = jest.fn(() => ({
    insert: mockSupabaseInsert,
  }));
  const mockCreateErrorDedupeHash = jest.fn();
  const mockShouldLogError = jest.fn();
  const mockReleaseErrorDedupeHash = jest.fn();
  const mockCreateAuditedAdminClient = jest.fn();
  const mockCreateRouteHandlerSupabaseClient = jest.fn();
  const mockHandleServerError = jest.fn();
  const mockNotifyError = jest.fn();
  const mockWaitUntil = jest.fn();
  const mockBuildKey = jest.fn();
  const mockEnforceRateLimit = jest.fn();

  let postHandler: (request: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    mockCreateErrorDedupeHash.mockResolvedValue("dedupe-hash");
    mockShouldLogError.mockResolvedValue(true);
    mockReleaseErrorDedupeHash.mockResolvedValue(undefined);
    mockCreateAuditedAdminClient.mockResolvedValue({ from: mockSupabaseFrom });
    mockCreateRouteHandlerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });
    mockHandleServerError.mockImplementation(() => undefined);
    mockNotifyError.mockResolvedValue(undefined);
    mockWaitUntil.mockResolvedValue(undefined);

    mockSupabaseInsert.mockResolvedValue({ error: null, data: [] });
    mockSupabaseFrom.mockClear();

    mockBuildKey.mockReturnValue("RL:error.report:ip:8.8.8.8");
    mockEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 49 });

    jest.doMock("@core/rate-limit", () => ({
      POLICIES: {
        "error.report": { scope: "error.report", limit: 50, window: "1 m", blockMs: 60_000 },
      },
      buildKey: mockBuildKey,
      enforceRateLimit: mockEnforceRateLimit,
    }));

    jest.doMock("@core/logging/deduplication", () => ({
      createErrorDedupeHash: mockCreateErrorDedupeHash,
      shouldLogError: mockShouldLogError,
      releaseErrorDedupeHash: mockReleaseErrorDedupeHash,
    }));

    jest.doMock("@core/security/secure-client-factory.impl", () => ({
      createAuditedAdminClient: mockCreateAuditedAdminClient,
    }));

    jest.doMock("@core/supabase/factory", () => ({
      createRouteHandlerSupabaseClient: mockCreateRouteHandlerSupabaseClient,
    }));

    jest.doMock("@core/utils/error-handler.server", () => ({
      handleServerError: mockHandleServerError,
      notifyError: mockNotifyError,
    }));

    jest.doMock("@core/utils/cloudflare-ctx", () => ({
      waitUntil: mockWaitUntil,
    }));

    const routeModule = await import("@/app/api/errors/route");
    postHandler = routeModule.POST;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("I-A-01: 正常系 - 認証情報を優先してDB保存し204を返す", async () => {
    const authUserId = "3c219fd5-4ea6-4e1a-9f31-2e18cbeb4f2b";

    mockCreateRouteHandlerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: authUserId,
              email: "auth-user@example.com",
            },
          },
          error: null,
        }),
      },
    });

    const payload = {
      error: {
        code: "TEST_ERROR",
        category: "system",
        severity: "error",
        title: "Test Error",
        message: "This is a test error message",
      },
      stackTrace: "Error: Test\\n    at test.ts:10:5",
      user: {
        id: "eb4f30d3-e356-46d9-b06a-3637028f9134",
        email: "client-claimed@example.com",
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

    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "8.8.8.8",
      },
      body: JSON.stringify(payload),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(204);
    expect(mockSupabaseInsert).toHaveBeenCalledTimes(1);

    const insertArgs = mockSupabaseInsert.mock.calls[0][0];
    expect(insertArgs).toMatchObject({
      log_level: "error",
      log_category: "system",
      actor_type: "user",
      actor_identifier: "auth-user@example.com",
      user_id: authUserId,
      action: "client_error",
      message: "This is a test error message",
      outcome: "failure",
      ip_address: "8.8.8.8",
      error_code: "UNKNOWN_ERROR",
      error_message: "This is a test error message",
      error_stack: "Error: Test\\n    at test.ts:10:5",
      dedupe_key: "dedupe-hash",
    });

    expect(insertArgs.metadata).toMatchObject({
      client_reported_user: {
        id: "eb4f30d3-e356-46d9-b06a-3637028f9134",
        email: "client-claimed@example.com",
        userAgent: "test-agent",
      },
      auth_user: {
        id: authUserId,
        email: "auth-user@example.com",
      },
    });

    expect(mockCreateAuditedAdminClient).toHaveBeenCalledWith(
      "error_collection",
      "Client Error Collection",
      expect.objectContaining({ userId: authUserId, ipAddress: "8.8.8.8" })
    );
  });

  test("I-A-02: 正常系 - 重複エラーはDB保存されず204", async () => {
    mockShouldLogError.mockResolvedValue(false);

    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "8.8.8.8",
      },
      body: JSON.stringify({
        error: {
          message: "Duplicate error message",
        },
        stackTrace: "Error: Duplicate\\n    at test.ts:20:5",
      }),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(204);
    expect(mockSupabaseInsert).not.toHaveBeenCalled();

    expect(mockCreateAuditedAdminClient).not.toHaveBeenCalled();
  });

  test("I-A-03: バリデーションエラー - 必須項目不足は422", async () => {
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        error: {
          code: "TEST_ERROR",
        },
      }),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(422);
    const responseData = await response.json();
    expect(responseData).toMatchObject({
      type: "https://minnano-shukin.com/errors/validation-error",
      status: 422,
      code: "VALIDATION_ERROR",
      detail: "Invalid request body",
      instance: "/api/errors",
    });

    expect(mockSupabaseInsert).not.toHaveBeenCalled();
  });

  test("I-A-04: 不正JSONは400(INVALID_JSON)", async () => {
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{invalid-json",
    });

    const response = await postHandler(request);

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData).toMatchObject({
      type: "https://minnano-shukin.com/errors/invalid-json",
      status: 400,
      code: "INVALID_JSON",
      detail: "Invalid JSON in request body",
      instance: "/api/errors",
    });

    expect(mockSupabaseInsert).not.toHaveBeenCalled();
  });

  test("I-A-05: レート制限発動 - 429とヘッダー", async () => {
    mockEnforceRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60, remaining: 0 });

    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "8.8.8.8, 1.1.1.1",
      },
      body: JSON.stringify({
        error: {
          message: "Test error",
        },
      }),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(429);
    const responseData = await response.json();
    expect(responseData).toMatchObject({
      type: "https://minnano-shukin.com/errors/rate-limited",
      status: 429,
      code: "RATE_LIMITED",
      detail: "Too many requests",
      instance: "/api/errors",
    });

    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(mockBuildKey).toHaveBeenCalledWith({ scope: "error.report", ip: "8.8.8.8" });
    expect(mockEnforceRateLimit).toHaveBeenCalledWith({
      keys: ["RL:error.report:ip:8.8.8.8"],
      policy: {
        scope: "error.report",
        limit: 50,
        window: "1 m",
        blockMs: 60_000,
      },
    });
  });

  test("I-A-06: DB保存エラー時も204を返しdedupeキーを解放", async () => {
    mockSupabaseInsert.mockResolvedValue({
      error: {
        code: "XX000",
        message: "Database connection failed",
      },
      data: null,
    });

    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "8.8.8.8",
      },
      body: JSON.stringify({
        error: {
          message: "Test error",
        },
      }),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(204);

    expect(mockReleaseErrorDedupeHash).toHaveBeenCalledWith("dedupe-hash");
    expect(mockHandleServerError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "XX000" }),
      expect.objectContaining({ action: "error_collection_insert_failed" })
    );
  });

  test("I-A-07: dedupe_key一意制約エラー時は204かつdedupeキーを解放しない", async () => {
    mockSupabaseInsert.mockResolvedValue({
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint dedupe_key",
      },
      data: null,
    });

    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        error: {
          message: "Test error",
        },
      }),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(204);

    expect(mockReleaseErrorDedupeHash).not.toHaveBeenCalled();
  });

  test("I-A-08: user.id が UUID 形式でない場合は422", async () => {
    const request = new NextRequest("https://example.com/api/errors", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        error: {
          message: "Test error",
        },
        user: {
          id: "not-a-uuid",
        },
      }),
    });

    const response = await postHandler(request);

    expect(response.status).toBe(422);
    const responseData = await response.json();
    expect(responseData).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
    });
    expect(mockSupabaseInsert).not.toHaveBeenCalled();
  });
});
