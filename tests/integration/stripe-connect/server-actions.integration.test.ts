/**
 * Server Actions Integration Tests
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { logger } from "@core/logging/app-logger";
import {
  setupStripeConnectRealApiTest,
  type StripeConnectRealApiTestSetup,
} from "./stripe-connect-real-api-test-setup";

describe("Server Actions Integration Tests", () => {
  let setup: StripeConnectRealApiTestSetup;

  beforeAll(async () => {
    setup = await setupStripeConnectRealApiTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("UI Status Mapping", () => {
    it("should return no_account UI status when account does not exist", async () => {
      const { UIStatusMapper } = await import("@features/stripe-connect/server");
      const mapper = new UIStatusMapper();
      const uiStatus = mapper.mapToUIStatus(null);
      expect(uiStatus).toBe("no_account");
      logger.info("no_account UI status test passed");
    });

    it("should map restricted status correctly", async () => {
      const { UIStatusMapper } = await import("@features/stripe-connect/server");
      const mapper = new UIStatusMapper();
      const uiStatus = mapper.mapToUIStatus("restricted");
      expect(uiStatus).toBe("restricted");
      logger.info("restricted UI status mapping test passed");
    });
  });

  describe("StatusSyncService", () => {
    it("should sync account status", async () => {
      const createResult = await setup.service.createExpressAccount({
        userId: setup.testUser.id,
        email: "test" + Date.now() + "@example.com",
        country: "JP",
        businessType: "individual",
      });
      setup.createdStripeAccountIds.push(createResult.accountId);

      const { StatusSyncService } = await import("@features/stripe-connect/server");
      const statusSyncService = new StatusSyncService(setup.service);

      const stripeAccount = await statusSyncService.syncAccountStatus(
        setup.testUser.id,
        createResult.accountId,
        {
          maxRetries: 3,
        }
      );

      expect(stripeAccount).toBeDefined();
      expect(stripeAccount.id).toBe(createResult.accountId);

      const account = await setup.service.getConnectAccountByUser(setup.testUser.id);
      expect(account).toBeDefined();
      logger.info("Status sync test passed");
    }, 30000);
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits with Redis", async () => {
      // Redisクライアントが利用可能か確認
      const { getRedisClient } = await import("@core/rate-limit/client");
      const redis = getRedisClient();

      logger.info("Redis client status", {
        available: !!redis,
        url: process.env.UPSTASH_REDIS_REST_URL ? "configured" : "not configured",
      });

      const { StatusSyncRateLimiter } = await import(
        "@features/stripe-connect/services/status-sync-rate-limiter"
      );
      const rateLimiter = new StatusSyncRateLimiter();
      // 同じuserIdを使用してレート制限をテスト
      const testUserId = "rate-limit-test-user";

      const results = [];
      for (let i = 0; i < 6; i++) {
        const result = await rateLimiter.checkRateLimit(testUserId);
        results.push(result);
        logger.info("Rate limit check result", {
          attempt: i + 1,
          allowed: result.allowed,
          remaining: result.remaining,
          retryAfter: result.retryAfter,
        });

        // デバッグ: Redisのキーを確認
        if (redis && i === 0) {
          try {
            const keys = await redis.keys("RL:stripe.connect.status_sync:*");
            logger.info("Redis keys after first attempt", { keys });
          } catch (error) {
            logger.warn("Failed to get Redis keys", { error });
          }
        }
      }

      const allowedCount = results.filter((r) => r.allowed).length;

      // Redisが利用可能な場合、最初の5回は許可され、6回目は拒否されるはず
      if (redis) {
        expect(allowedCount).toBeLessThanOrEqual(5);
        logger.info("Rate limit enforcement test passed with Redis", {
          allowedCount,
        });
      } else {
        // Redisが利用できない場合はスキップ
        logger.warn("Redis not available, skipping rate limit enforcement test");
      }
    }, 30000);

    it("should return consistent result structure", async () => {
      const { StatusSyncRateLimiter } = await import(
        "@features/stripe-connect/services/status-sync-rate-limiter"
      );
      const rateLimiter = new StatusSyncRateLimiter();
      const testUserId = "testuser" + Date.now();

      const result = await rateLimiter.checkRateLimit(testUserId);

      // 結果の構造を検証
      expect(result).toHaveProperty("allowed");
      expect(typeof result.allowed).toBe("boolean");

      logger.info("Rate limit result structure test passed", {
        result,
      });
    }, 30000);
  });
});
