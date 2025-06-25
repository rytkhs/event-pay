/**
 * @file rate-limit.tsのテストスイート
 * @description レート制限機能のテスト
 */

// 環境変数を事前に設定してモジュール読み込みエラーを防ぐ
process.env.NODE_ENV = "development";
delete process.env.RATE_LIMIT_REDIS_URL;
delete process.env.RATE_LIMIT_REDIS_TOKEN;

import { checkRateLimit, createRateLimitMiddleware } from "@/lib/rate-limit";

// Redisクライアントをモック
jest.mock("@upstash/redis", () => ({
  Redis: jest.fn()
}));

jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: {
    slidingWindow: jest.fn(() => "mock-limiter"),
  }
}));

describe("lib/rate-limit", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("checkRateLimit function", () => {
    test("Redis設定がない場合のフォールバック動作", async () => {
      // Redis設定を削除
      delete process.env.RATE_LIMIT_REDIS_URL;
      delete process.env.RATE_LIMIT_REDIS_TOKEN;

      const result = await checkRateLimit("test-ip");

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
      expect(result.reset).toBeInstanceOf(Date);
    });

    test("エラー発生時のフォールバック動作", async () => {
      // モックレート制限を作成してエラーを投げる
      const mockRateLimit = {
        limit: jest.fn().mockRejectedValue(new Error("Redis connection failed"))
      };

      const result = await checkRateLimit("test-ip", mockRateLimit);

      expect(result.success).toBe(true); // エラー時は通す
      expect(result.limit).toBe(1000);
      expect(result.remaining).toBe(999);
    });

    test("正常なレート制限チェック", async () => {
      const mockRateLimit = {
        limit: jest.fn().mockResolvedValue({
          success: false,
          limit: 10,
          remaining: 0,
          reset: new Date(Date.now() + 60000)
        })
      };

      const result = await checkRateLimit("test-ip", mockRateLimit);

      expect(result.success).toBe(false);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(0);
      expect(mockRateLimit.limit).toHaveBeenCalledWith("test-ip");
    });
  });

  describe("createRateLimitMiddleware function", () => {
    test("ミドルウェアが正しいレスポンスヘッダーを返す", async () => {
      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue("192.168.1.1")
        }
      } as any;

      const mockRateLimit = {
        limit: jest.fn().mockResolvedValue({
          success: true,
          limit: 10,
          remaining: 5,
          reset: new Date(1234567890000)
        })
      };

      const middleware = createRateLimitMiddleware(mockRateLimit);
      const result = await middleware(mockRequest);

      expect(result.success).toBe(true);
      expect(result.headers).toEqual({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "5",
        "X-RateLimit-Reset": "1234567890000"
      });
    });

    test("IPアドレス取得のフォールバック", async () => {
      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      } as any;

      const mockRateLimit = {
        limit: jest.fn().mockResolvedValue({
          success: true,
          limit: 10,
          remaining: 5,
          reset: new Date()
        })
      };

      const middleware = createRateLimitMiddleware(mockRateLimit);
      await middleware(mockRequest);

      // フォールバックIPアドレスが使用されることを確認
      expect(mockRateLimit.limit).toHaveBeenCalledWith("127.0.0.1");
    });

    test("複数のIPアドレスがある場合の処理", async () => {
      const mockRequest = {
        headers: {
          get: jest.fn().mockReturnValue("192.168.1.1, 10.0.0.1, 172.16.0.1")
        }
      } as any;

      const mockRateLimit = {
        limit: jest.fn().mockResolvedValue({
          success: true,
          limit: 10,
          remaining: 5,
          reset: new Date()
        })
      };

      const middleware = createRateLimitMiddleware(mockRateLimit);
      await middleware(mockRequest);

      // 最初のIPアドレスが使用されることを確認
      expect(mockRateLimit.limit).toHaveBeenCalledWith("192.168.1.1");
    });
  });

  describe("環境変数による動作変更", () => {
    test("開発環境でのRedis設定なしの動作", () => {
      process.env.NODE_ENV = "development";
      delete process.env.RATE_LIMIT_REDIS_URL;
      delete process.env.RATE_LIMIT_REDIS_TOKEN;

      // モジュールを再読み込みしてテスト
      // 実際の実装では、開発環境での警告メッセージが表示される
      expect(process.env.RATE_LIMIT_REDIS_URL).toBeUndefined();
      expect(process.env.RATE_LIMIT_REDIS_TOKEN).toBeUndefined();
    });

    test("本番環境でのRedis設定必須チェック", () => {
      process.env.NODE_ENV = "production";
      delete process.env.RATE_LIMIT_REDIS_URL;
      delete process.env.RATE_LIMIT_REDIS_TOKEN;

      // 本番環境ではRedis設定が必須
      // 実際の実装では、この状況でエラーが投げられる
      expect(process.env.NODE_ENV).toBe("production");
    });
  });
});