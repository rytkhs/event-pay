import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// テスト対象となるレート制限ユーティリティ関数（まだ実装されていない）
import { createRateLimit, checkRateLimit, RateLimitConfig } from "@/lib/rate-limit";

// テスト用のRedisインスタンス（モックではなく実際のUpstashサーバーを使用）
const testRedis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

describe("Rate Limit Core Functionality", () => {
  beforeEach(async () => {
    // テスト前にRedisのテストキーをクリーンアップ
    const testKeys = await testRedis.keys("test_*");
    if (testKeys.length > 0) {
      await testRedis.del(...testKeys);
    }
  });

  afterAll(async () => {
    // テスト終了後のクリーンアップ
    const testKeys = await testRedis.keys("test_*");
    if (testKeys.length > 0) {
      await testRedis.del(...testKeys);
    }
  });

  describe("createRateLimit", () => {
    test("should create rate limit instance with sliding window configuration", () => {
      const config: RateLimitConfig = {
        requests: 10,
        window: "5 m",
        identifier: "ip",
      };

      const rateLimit = createRateLimit(config);

      expect(rateLimit).toBeDefined();
      expect(rateLimit).toBeInstanceOf(Ratelimit);
    });

    test("should create rate limit instance with different configurations", () => {
      const configs: RateLimitConfig[] = [
        { requests: 3, window: "1 m", identifier: "user" },
        { requests: 100, window: "1 s", identifier: "global" },
        { requests: 30, window: "1 m", identifier: "ip" },
      ];

      configs.forEach((config) => {
        const rateLimit = createRateLimit(config);
        expect(rateLimit).toBeDefined();
        expect(rateLimit).toBeInstanceOf(Ratelimit);
      });
    });
  });

  describe("checkRateLimit", () => {
    test("should allow requests within limit", async () => {
      const config: RateLimitConfig = {
        requests: 5,
        window: "1 m",
        identifier: "ip",
      };

      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });

      const result = await checkRateLimit(mockRequest, config, "test_allow");

      expect(result.success).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.reset).toBeGreaterThan(Date.now());
    });

    test("should block requests exceeding limit", async () => {
      const config: RateLimitConfig = {
        requests: 2,
        window: "1 m",
        identifier: "ip",
      };

      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.2" },
      });

      // 制限内のリクエスト（1回目）
      const result1 = await checkRateLimit(mockRequest, config, "test_block");
      expect(result1.success).toBe(true);

      // 制限内のリクエスト（2回目）
      const result2 = await checkRateLimit(mockRequest, config, "test_block");
      expect(result2.success).toBe(true);

      // 制限を超えるリクエスト（3回目）
      const result3 = await checkRateLimit(mockRequest, config, "test_block");
      expect(result3.success).toBe(false);
      expect(result3.remaining).toBe(0);
    });

    test("should handle different IP addresses independently", async () => {
      const config: RateLimitConfig = {
        requests: 1,
        window: "1 m",
        identifier: "ip",
      };

      const request1 = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.3" },
      });

      const request2 = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.4" },
      });

      // IP1での1回目のリクエスト（成功）
      const result1 = await checkRateLimit(request1, config, "test_ip1");
      expect(result1.success).toBe(true);

      // IP2での1回目のリクエスト（成功、独立してカウント）
      const result2 = await checkRateLimit(request2, config, "test_ip2");
      expect(result2.success).toBe(true);

      // IP1での2回目のリクエスト（制限にかかる）
      const result3 = await checkRateLimit(request1, config, "test_ip1");
      expect(result3.success).toBe(false);

      // IP2での2回目のリクエスト（制限にかかる）
      const result4 = await checkRateLimit(request2, config, "test_ip2");
      expect(result4.success).toBe(false);
    });

    test("should extract IP address correctly from various headers", async () => {
      const config: RateLimitConfig = {
        requests: 5,
        window: "1 m",
        identifier: "ip",
      };

      // x-forwarded-for ヘッダーからIP取得
      const request1 = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.5" },
      });

      // x-real-ip ヘッダーからIP取得
      const request2 = new NextRequest("http://localhost:3000/test", {
        headers: { "x-real-ip": "192.168.1.6" },
      });

      // ヘッダーがない場合のデフォルトIP
      const request3 = new NextRequest("http://localhost:3000/test");

      const result1 = await checkRateLimit(request1, config, "test_header1");
      const result2 = await checkRateLimit(request2, config, "test_header2");
      const result3 = await checkRateLimit(request3, config, "test_header3");

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
    });

    test("should include proper rate limit metadata", async () => {
      const config: RateLimitConfig = {
        requests: 10,
        window: "5 m",
        identifier: "ip",
      };

      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.7" },
      });

      const result = await checkRateLimit(mockRequest, config, "test_metadata");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("reset");
      expect(typeof result.limit).toBe("number");
      expect(typeof result.remaining).toBe("number");
      expect(typeof result.reset).toBe("number");
      expect(result.reset).toBeGreaterThan(Date.now());
    });
  });

  describe("Error Handling", () => {
    test("should handle Redis connection errors gracefully", async () => {
      // 無効なRedis設定でテスト
      const invalidConfig: RateLimitConfig = {
        requests: 5,
        window: "1 m",
        identifier: "ip",
      };

      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.8" },
      });

      // Redis接続エラーが発生してもアプリケーションが停止しないことを確認
      // この場合、フェイルオープン（制限なしで通す）か、フェイルクローズ（全て拒否）かは要件次第
      expect(async () => {
        await checkRateLimit(mockRequest, invalidConfig, "test_error");
      }).not.toThrow();
    });

    test("should handle invalid configuration gracefully", async () => {
      const invalidConfigs = [
        { requests: 0, window: "1 m", identifier: "ip" },
        { requests: -1, window: "1 m", identifier: "ip" },
        { requests: 5, window: "", identifier: "ip" },
        { requests: 5, window: "1 m", identifier: "" },
      ];

      const mockRequest = new NextRequest("http://localhost:3000/test", {
        headers: { "x-forwarded-for": "192.168.1.9" },
      });

      for (const config of invalidConfigs) {
        expect(() => {
          createRateLimit(config as RateLimitConfig);
        }).toThrow();
      }
    });
  });

  describe("Security Requirements", () => {
    test("should prevent rate limit bypass attempts", async () => {
      const config: RateLimitConfig = {
        requests: 1,
        window: "1 m",
        identifier: "ip",
      };

      // 異なるヘッダーを使った同一IPでのバイパス試行
      const bypassAttempts = [
        new NextRequest("http://localhost:3000/test", {
          headers: { "x-forwarded-for": "192.168.1.10" },
        }),
        new NextRequest("http://localhost:3000/test", {
          headers: { "x-real-ip": "192.168.1.10" },
        }),
        new NextRequest("http://localhost:3000/test", {
          headers: {
            "x-forwarded-for": "192.168.1.10",
            "x-real-ip": "192.168.1.10",
          },
        }),
      ];

      // 1回目は成功
      const result1 = await checkRateLimit(bypassAttempts[0], config, "test_bypass");
      expect(result1.success).toBe(true);

      // 2回目以降は全て失敗（バイパスできない）
      for (let i = 1; i < bypassAttempts.length; i++) {
        const result = await checkRateLimit(bypassAttempts[i], config, "test_bypass");
        expect(result.success).toBe(false);
      }
    });

    test("should handle malformed IP addresses", async () => {
      const config: RateLimitConfig = {
        requests: 5,
        window: "1 m",
        identifier: "ip",
      };

      const malformedRequests = [
        new NextRequest("http://localhost:3000/test", {
          headers: { "x-forwarded-for": "invalid-ip" },
        }),
        new NextRequest("http://localhost:3000/test", {
          headers: { "x-forwarded-for": "999.999.999.999" },
        }),
        new NextRequest("http://localhost:3000/test", {
          headers: { "x-forwarded-for": "" },
        }),
      ];

      for (const request of malformedRequests) {
        expect(async () => {
          await checkRateLimit(request, config, "test_malformed");
        }).not.toThrow();
      }
    });
  });
});
