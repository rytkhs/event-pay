import { RateLimitStore, RateLimitConfig, RateLimitResult, RateLimitData } from "./types";
import { MemoryRateLimitStore } from "./memory-store";
import { OptimizedMemoryRateLimitStore } from "./optimized-memory-store";
import { RedisRateLimitStore, createRedisClient } from "./redis-store";
import { RATE_LIMIT_CONFIG } from "@/config/security";

// シングルトンストア
let rateLimitStoreInstance: RateLimitStore | null = null;

// ストアファクトリー
export async function createRateLimitStore(): Promise<RateLimitStore> {
  if (rateLimitStoreInstance) {
    return rateLimitStoreInstance;
  }

  if (process.env.NODE_ENV === "production" && process.env.REDIS_URL) {
    try {
      const redisClient = await createRedisClient();
      rateLimitStoreInstance = new RedisRateLimitStore(redisClient);
      return rateLimitStoreInstance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to create Redis store, falling back to optimized memory store:", error);
      rateLimitStoreInstance = new OptimizedMemoryRateLimitStore();
      return rateLimitStoreInstance;
    }
  }

  // 最適化されたメモリストアを使用
  rateLimitStoreInstance = new OptimizedMemoryRateLimitStore();
  return rateLimitStoreInstance;
}

// テスト用リセット機能
export function resetMemoryStore(): void {
  if (
    rateLimitStoreInstance instanceof MemoryRateLimitStore ||
    rateLimitStoreInstance instanceof OptimizedMemoryRateLimitStore
  ) {
    rateLimitStoreInstance.clear();
  }
  rateLimitStoreInstance = null;
}

// レート制限チェック関数
export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIG.general
): Promise<RateLimitResult> {
  const now = Date.now();
  const existing = await store.get(key);

  // ブロック状態のチェック
  if (existing?.blockedUntil && now < existing.blockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.blockedUntil - now) / 1000),
    };
  }

  // 新しいウィンドウかチェック
  if (!existing || now - existing.windowStart > config.windowMs) {
    // 新しいウィンドウの開始
    const newData: RateLimitData = {
      attempts: 1,
      windowStart: now,
    };
    await store.set(key, newData, config.windowMs);
    return { allowed: true };
  }

  // 既存ウィンドウ内での試行回数チェック
  if (existing.attempts >= config.maxAttempts) {
    // 制限に達した場合、ブロック
    const blockedData: RateLimitData = {
      ...existing,
      blockedUntil: now + config.blockDurationMs,
    };
    await store.set(key, blockedData, config.blockDurationMs);
    return {
      allowed: false,
      retryAfter: Math.ceil(config.blockDurationMs / 1000),
    };
  }

  // 試行回数を増加
  const updatedData: RateLimitData = {
    ...existing,
    attempts: existing.attempts + 1,
  };
  await store.set(key, updatedData, config.windowMs - (now - existing.windowStart));
  return { allowed: true };
}

// エクスポート
export * from "./types";
export { MemoryRateLimitStore } from "./memory-store";
export { RedisRateLimitStore, createRedisClient } from "./redis-store";
