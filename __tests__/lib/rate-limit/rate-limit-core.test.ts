/**
 * レート制限コア機能の単体テスト
 * @jest-environment node
 */

import { checkRateLimit, createRateLimitStore } from "@/lib/rate-limit/index";
import type { RateLimitConfig, RateLimitStore, RateLimitResult } from "@/lib/rate-limit/types";

// Redis クライアントをモック
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  multi: jest.fn(),
  exec: jest.fn(),
};

// メモリストアをモック
const mockMemoryStore = new Map();

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn(() => mockRedisClient),
}));

describe("Rate Limit Core Functions", () => {
  const testConfig: RateLimitConfig = {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 10, // 10回まで
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMemoryStore.clear();
  });

  describe("createRateLimitStore", () => {
    it("Redis環境変数がある場合はRedisストアを作成する", async () => {
      const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
      const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

      const store = await createRateLimitStore();

      expect(store).toBeDefined();
      expect(store.get).toBeDefined();
      expect(store.set).toBeDefined();

      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    });

    it("Redis環境変数がない場合はメモリストアを作成する", async () => {
      const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
      const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const store = await createRateLimitStore();

      expect(store).toBeDefined();
      expect(store.get).toBeDefined();
      expect(store.set).toBeDefined();

      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    });
  });

  describe("checkRateLimit with Memory Store", () => {
    let memoryStore: RateLimitStore;

    beforeEach(async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      memoryStore = await createRateLimitStore();
      process.env.NODE_ENV = originalEnv;
    });

    it("初回アクセスは許可される", async () => {
      const result = await checkRateLimit(memoryStore, "test_user_1", testConfig);

      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it("制限内のアクセスは許可される", async () => {
      const identifier = "test_user_2";

      // 9回アクセス（制限は10回）
      for (let i = 0; i < 9; i++) {
        const result = await checkRateLimit(memoryStore, identifier, testConfig);
        expect(result.allowed).toBe(true);
      }

      // 10回目も許可される
      const finalResult = await checkRateLimit(memoryStore, identifier, testConfig);
      expect(finalResult.allowed).toBe(true);
    });

    it("制限を超えたアクセスは拒否される", async () => {
      const identifier = "test_user_3";

      // 10回アクセス（制限まで）
      for (let i = 0; i < 10; i++) {
        await checkRateLimit(memoryStore, identifier, testConfig);
      }

      // 11回目は拒否される
      const result = await checkRateLimit(memoryStore, identifier, testConfig);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("異なるユーザーは独立してカウントされる", async () => {
      const user1 = "test_user_4";
      const user2 = "test_user_5";

      // user1が制限に達する
      for (let i = 0; i < 11; i++) {
        await checkRateLimit(memoryStore, user1, testConfig);
      }

      // user2は影響を受けない
      const result = await checkRateLimit(memoryStore, user2, testConfig);
      expect(result.allowed).toBe(true);
    });

    it("ウィンドウ期間後にカウントがリセットされる", async () => {
      const identifier = "test_user_6";
      const shortConfig: RateLimitConfig = {
        windowMs: 100, // 100ms
        maxAttempts: 2,
        blockDurationMs: 200,
      };

      // 制限に達する
      await checkRateLimit(memoryStore, identifier, shortConfig);
      await checkRateLimit(memoryStore, identifier, shortConfig);
      const blockedResult = await checkRateLimit(memoryStore, identifier, shortConfig);
      expect(blockedResult.allowed).toBe(false);

      // ウィンドウ期間を待つ
      await new Promise((resolve) => setTimeout(resolve, 150));

      // リセットされて再び許可される
      const resetResult = await checkRateLimit(memoryStore, identifier, shortConfig);
      expect(resetResult.allowed).toBe(true);
    });

    it("ブロック期間中は継続して拒否される", async () => {
      const identifier = "test_user_7";
      const shortConfig: RateLimitConfig = {
        windowMs: 50,
        maxAttempts: 1,
        blockDurationMs: 200,
      };

      // 制限に達する
      await checkRateLimit(memoryStore, identifier, shortConfig);
      const blockedResult1 = await checkRateLimit(memoryStore, identifier, shortConfig);
      expect(blockedResult1.allowed).toBe(false);

      // 少し待ってもまだブロック中
      await new Promise((resolve) => setTimeout(resolve, 100));
      const blockedResult2 = await checkRateLimit(memoryStore, identifier, shortConfig);
      expect(blockedResult2.allowed).toBe(false);
    });

    it("retryAfterが正しく計算される", async () => {
      const identifier = "test_user_8";
      const shortConfig: RateLimitConfig = {
        windowMs: 100,
        maxAttempts: 1,
        blockDurationMs: 1000,
      };

      // 制限に達する
      await checkRateLimit(memoryStore, identifier, shortConfig);
      const blockedResult = await checkRateLimit(memoryStore, identifier, shortConfig);

      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.retryAfter).toBeDefined();
      expect(blockedResult.retryAfter).toBeGreaterThan(0);
      expect(blockedResult.retryAfter).toBeLessThanOrEqual(1);
    });
  });

  describe("checkRateLimit with Redis Store", () => {
    let redisStore: RateLimitStore;

    beforeEach(async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      redisStore = await createRateLimitStore();
      process.env.NODE_ENV = originalEnv;
    });

    it("初回アクセス時にRedisからデータを取得する", async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue("OK");

      const result = await checkRateLimit(redisStore, "redis_user_1", testConfig);

      expect(result.allowed).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith("rate_limit:redis_user_1");
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it("既存のカウントがある場合は更新する", async () => {
      const existingData = JSON.stringify({
        count: 5,
        windowStart: Date.now() - 60000, // 1分前
        blockedUntil: null,
      });
      mockRedisClient.get.mockResolvedValue(existingData);
      mockRedisClient.set.mockResolvedValue("OK");

      const result = await checkRateLimit(redisStore, "redis_user_2", testConfig);

      expect(result.allowed).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith("rate_limit:redis_user_2");
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it("制限に達した場合はブロック情報を保存する", async () => {
      const existingData = JSON.stringify({
        count: 10,
        windowStart: Date.now() - 60000,
        blockedUntil: null,
      });
      mockRedisClient.get.mockResolvedValue(existingData);
      mockRedisClient.set.mockResolvedValue("OK");

      const result = await checkRateLimit(redisStore, "redis_user_3", testConfig);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it("ブロック期間中のアクセスは拒否される", async () => {
      const blockedData = JSON.stringify({
        count: 15,
        windowStart: Date.now() - 60000,
        blockedUntil: Date.now() + 300000, // 5分後まで
      });
      mockRedisClient.get.mockResolvedValue(blockedData);

      const result = await checkRateLimit(redisStore, "redis_user_4", testConfig);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("Redisエラー時は安全のため拒否する", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Redis connection failed"));

      const result = await checkRateLimit(redisStore, "redis_user_5", testConfig);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
    });

    it("無効なJSONデータの場合は新規として扱う", async () => {
      mockRedisClient.get.mockResolvedValue("invalid json data");
      mockRedisClient.set.mockResolvedValue("OK");

      const result = await checkRateLimit(redisStore, "redis_user_6", testConfig);

      expect(result.allowed).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    let memoryStore: RateLimitStore;

    beforeEach(async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      memoryStore = await createRateLimitStore();
      process.env.NODE_ENV = originalEnv;
    });

    it("maxAttemptsが0の場合は常に拒否する", async () => {
      const zeroConfig: RateLimitConfig = {
        windowMs: 60000,
        maxAttempts: 0,
        blockDurationMs: 300000,
      };

      const result = await checkRateLimit(memoryStore, "zero_user", zeroConfig);
      expect(result.allowed).toBe(false);
    });

    it("maxAttemptsが負の値の場合は常に拒否する", async () => {
      const negativeConfig: RateLimitConfig = {
        windowMs: 60000,
        maxAttempts: -1,
        blockDurationMs: 300000,
      };

      const result = await checkRateLimit(memoryStore, "negative_user", negativeConfig);
      expect(result.allowed).toBe(false);
    });

    it("windowMsが0の場合は毎回リセットされる", async () => {
      const instantConfig: RateLimitConfig = {
        windowMs: 0,
        maxAttempts: 1,
        blockDurationMs: 1000,
      };

      // 1回目は許可
      const result1 = await checkRateLimit(memoryStore, "instant_user", instantConfig);
      expect(result1.allowed).toBe(true);

      // 2回目も許可（ウィンドウが即座にリセット）
      const result2 = await checkRateLimit(memoryStore, "instant_user", instantConfig);
      expect(result2.allowed).toBe(true);
    });

    it("blockDurationMsが0の場合は即座に解除される", async () => {
      const noBlockConfig: RateLimitConfig = {
        windowMs: 60000,
        maxAttempts: 1,
        blockDurationMs: 0,
      };

      // 制限に達する
      await checkRateLimit(memoryStore, "no_block_user", noBlockConfig);
      const blockedResult = await checkRateLimit(memoryStore, "no_block_user", noBlockConfig);
      expect(blockedResult.allowed).toBe(false);

      // 即座に解除される（次のアクセスで新しいウィンドウ）
      await new Promise((resolve) => setTimeout(resolve, 1));
      const unblocked = await checkRateLimit(memoryStore, "no_block_user", noBlockConfig);
      expect(unblocked.allowed).toBe(true);
    });

    it("空の識別子でも正常に動作する", async () => {
      const result = await checkRateLimit(memoryStore, "", testConfig);
      expect(result.allowed).toBe(true);
    });

    it("非常に長い識別子でも正常に動作する", async () => {
      const longIdentifier = "a".repeat(1000);
      const result = await checkRateLimit(memoryStore, longIdentifier, testConfig);
      expect(result.allowed).toBe(true);
    });

    it("特殊文字を含む識別子でも正常に動作する", async () => {
      const specialIdentifier = "user@domain.com:192.168.1.1#special";
      const result = await checkRateLimit(memoryStore, specialIdentifier, testConfig);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Performance and Memory", () => {
    let memoryStore: RateLimitStore;

    beforeEach(async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      memoryStore = await createRateLimitStore();
      process.env.NODE_ENV = originalEnv;
    });

    it("大量のユーザーを処理できる", async () => {
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(checkRateLimit(memoryStore, `user_${i}`, testConfig));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(1000);
      expect(results.every((r) => r.allowed)).toBe(true);
    });

    it("同時アクセスを正しく処理する", async () => {
      const identifier = "concurrent_user";
      const promises = [];

      // 同じユーザーで20回同時アクセス
      for (let i = 0; i < 20; i++) {
        promises.push(checkRateLimit(memoryStore, identifier, testConfig));
      }

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      // 制限は10回なので、10回は許可、10回は拒否されるはず
      expect(allowedCount).toBeLessThanOrEqual(10);
      expect(blockedCount).toBeGreaterThan(0);
      expect(allowedCount + blockedCount).toBe(20);
    });
  });
});
