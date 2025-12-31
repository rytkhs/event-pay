import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

import type { RateLimitPolicy } from "./types";

// Upstash Redis クライアントのシングルトン
let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  try {
    if (redisClient) return redisClient;
    const url = getEnv().UPSTASH_REDIS_REST_URL;
    const token = getEnv().UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      redisClient = new Redis({ url, token });
      return redisClient;
    }
  } catch (error) {
    logger.warn("Failed to initialize Upstash Redis client", {
      category: "security",
      action: "rate_limit_store_error",
      actor_type: "system",
      error_message: error instanceof Error ? error.message : String(error),
      outcome: "failure",
    });
  }
  return null;
}

// スコープ毎に Ratelimit インスタンスをキャッシュ
const scopeToLimiter = new Map<string, Ratelimit>();

export function getLimiterForPolicy(policy: RateLimitPolicy): Ratelimit | null {
  const existing = scopeToLimiter.get(policy.scope);
  if (existing) return existing;

  const redis = getRedisClient();
  if (!redis) {
    return null; // dev フォールバックは index.ts 側で処理
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    analytics: true,
    prefix: `RL:${policy.scope}`,
  });

  scopeToLimiter.set(policy.scope, limiter);
  return limiter;
}
