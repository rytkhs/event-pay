import { RateLimitStore, RateLimitData } from "./types";

// Redis接続の型定義（本番環境で使用）
interface RedisClient {
  get(key: string): Promise<string | null>;
  /**
   * When interacting with Upstash Redis we sometimes pass an expiration in seconds (SETEX)
   * instead of the PX option used by ioredis compatible clients. Allow both signatures
   * so that the concrete implementation can decide which command to execute.
   */
  set(
    key: string,
    value: string,
    optionsOrExpireInSeconds?: { PX?: number } | number
  ): Promise<void>;
  /**
   * Some Redis libraries return the number of keys removed (`number`) while others return
   * nothing (`void`). Accept both for broader compatibility.
   */
  del(key: string): Promise<void | number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void | number>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: RedisClient) {
    if (!redis) {
      throw new Error("RedisClient is required for RedisRateLimitStore");
    }
  }

  async get(key: string): Promise<RateLimitData | null> {
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      // eslint-disable-next-line no-console
      // console.error("Redis get error:", _);
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
      // console.error("Redis set error:", error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      // eslint-disable-next-line no-console
      // console.error("Redis delete error:", error);
      throw error;
    }
  }
}

// 本番環境用のRedis接続ファクトリー
export async function createRedisClient(): Promise<RedisClient | null> {
  // 環境変数から接続情報を取得
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // 環境変数が未設定の場合はnullを返す（型安全）
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required in production"
      );
    } else {
      // console.warn("Redis環境変数が未設定です。開発環境ではメモリベースのレート制限を使用します。");
      // 開発環境では型安全にnullを返す
      return null;
    }
  }

  try {
    // @upstash/redisを使用してRedisクライアントを作成
    const { Redis } = await import("@upstash/redis");

    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    // 接続テスト用のpingコマンドを実行
    redis.ping().catch(() => {
      // console.error("Redis接続テストに失敗しました:", error);
    });

    return {
      get: async (key: string): Promise<string | null> => {
        try {
          const result = await redis.get(key);
          return result as string | null;
        } catch (error) {
          // console.error(`Redis GET error for key ${key}:`, error);
          throw error;
        }
      },
      set: async (
        key: string,
        value: string,
        optionsOrExpireInSeconds?: { PX?: number } | number
      ): Promise<void> => {
        try {
          if (optionsOrExpireInSeconds) {
            if (typeof optionsOrExpireInSeconds === "object" && optionsOrExpireInSeconds.PX) {
              // PXオプション（ミリ秒）を秒に変換してSETEXを使用
              const expireInSeconds = Math.ceil(optionsOrExpireInSeconds.PX / 1000);
              await redis.setex(key, expireInSeconds, value);
            } else if (typeof optionsOrExpireInSeconds === "number") {
              // 直接秒数が指定された場合
              await redis.setex(key, optionsOrExpireInSeconds, value);
            } else {
              await redis.set(key, value);
            }
          } else {
            await redis.set(key, value);
          }
        } catch (error) {
          // console.error(`Redis SET error for key ${key}:`, error);
          throw error;
        }
      },
      del: async (key: string): Promise<void> => {
        try {
          await redis.del(key);
        } catch (error) {
          // console.error(`Redis DEL error for key ${key}:`, error);
          throw error;
        }
      },
      incr: async (key: string): Promise<number> => {
        try {
          const result = await redis.incr(key);
          return result;
        } catch (error) {
          // console.error(`Redis INCR error for key ${key}:`, error);
          throw error;
        }
      },
      expire: async (key: string, seconds: number): Promise<void> => {
        try {
          await redis.expire(key, seconds);
        } catch (error) {
          // console.error(`Redis EXPIRE error for key ${key}:`, error);
          throw error;
        }
      },
    };
  } catch (error) {
    // console.error("Redis client initialization failed:", error);
    throw new Error(`Failed to create Redis client: ${error}`);
  }
}
