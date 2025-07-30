/**
 * レート制限ミドルウェアの単体テスト
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { withRateLimit, handleRateLimit } from "@/lib/rate-limit-middleware";
import { checkRateLimit, createRateLimitStore } from "@/lib/rate-limit/index";
import type { RateLimitConfig } from "@/lib/rate-limit/types";

// NextRequestのモック
const createMockRequest = (url: string, headers: Record<string, string> = {}) => {
  const request = {
    url,
    headers: new Map(Object.entries(headers)),
  } as Partial<NextRequest>;

  // NextRequestのメソッドを模擬
  request.headers = {
    get: (name: string) => headers[name] || null,
  } as NextRequest['headers'];

  return request as NextRequest;
};

// レート制限ライブラリをモック
jest.mock("@/lib/rate-limit/index", () => ({
  checkRateLimit: jest.fn(),
  createRateLimitStore: jest.fn(),
}));

const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const mockCreateRateLimitStore = createRateLimitStore as jest.MockedFunction<typeof createRateLimitStore>;

describe("Rate Limit Middleware", () => {
  const testConfig: RateLimitConfig = {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 10, // 10回まで
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  };

  const mockStore = {} as ReturnType<typeof createRateLimitStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRateLimitStore.mockResolvedValue(mockStore);
  });

  describe("withRateLimit", () => {
    it("レート制限を通過した場合、nullを返すこと", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: true,
      });

      const request = createMockRequest("http://localhost:3000/api/test", {
        "x-forwarded-for": "192.168.1.1",
      });

      const middleware = withRateLimit(testConfig, "test");
      const result = await middleware(request);
      expect(result).toBeNull();
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        mockStore,
        "test_192.168.1.1",
        testConfig
      );
    });

    it("レート制限に達した場合、429エラーレスポンスを返すこと", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 300,
      });

      const request = createMockRequest("http://localhost:3000/api/test", {
        "x-forwarded-for": "192.168.1.1",
      });

      const middleware = withRateLimit(testConfig, "test");
      const result = await middleware(request);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
      expect(result?.headers.get("Retry-After")).toBe("300");

      const body = await result?.json();
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "レート制限に達しました。しばらく待ってから再試行してください。",
          retryAfter: 300,
        },
      });
    });

    it("IPアドレスが取得できない場合、unknownを使用すること", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: true,
      });

      const request = createMockRequest("http://localhost:3000/api/test");

      const middleware = withRateLimit(testConfig, "test");
      await middleware(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        mockStore,
        "test_unknown",
        testConfig
      );
    });
  });

  describe("handleRateLimit", () => {
    it("withRateLimitのラッパーとして正しく動作すること", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: true,
      });

      const request = createMockRequest("http://localhost:3000/api/test", {
        "x-forwarded-for": "192.168.1.1",
      });

      const result = await handleRateLimit(request, testConfig, "test");

      expect(result).toBeNull();
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        mockStore,
        "test_192.168.1.1",
        testConfig
      );
    });
  });
});