import { RateLimitStore, RateLimitData } from "./types";

// Redis接続の型定義（本番環境で使用）
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { PX?: number }): Promise<void>;
  del(key: string): Promise<number>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: RedisClient) {}

  async get(key: string): Promise<RateLimitData | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Redis get error:", error);
      return null;
    }
  }

  async set(key: string, data: RateLimitData, ttlMs?: number): Promise<void> {
    try {
      const value = JSON.stringify(data);
      if (ttlMs) {
        await this.redis.set(key, value, { PX: ttlMs });
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Redis set error:", error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Redis delete error:", error);
      throw error;
    }
  }
}

// 本番環境用のRedis接続ファクトリー
export function createRedisClient(): RedisClient {
  // 本番環境では実際のRedisクライアント（@upstash/redis等）を返す
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required in production");
  }

  // 実装例（実際のRedisライブラリに応じて調整）
  // return new Redis(redisUrl)

  // 一時的なスタブ実装
  throw new Error("Redis client implementation needed for production");
}
