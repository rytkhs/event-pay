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
  // 環境変数から接続情報を取得
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL;
  const redisToken = process.env.RATE_LIMIT_REDIS_TOKEN;

  // 開発環境では環境変数が未設定の場合はエラーを投げずに警告のみ
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RATE_LIMIT_REDIS_URL and RATE_LIMIT_REDIS_TOKEN environment variables are required in production"
      );
    } else {
      console.warn(
        "Redis環境変数が未設定です。開発環境ではメモリベースのレート制限を使用します。"
      );
      throw new Error("Redis environment variables not configured");
    }
  }

  try {
    // @upstash/redisを使用してRedisクライアントを作成
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Redis } = require("@upstash/redis");
    
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    // 接続テスト用のpingコマンドを実行
    redis.ping().catch((error: Error) => {
      console.error("Redis接続テストに失敗しました:", error);
    });

    return {
      get: async (key: string): Promise<string | null> => {
        try {
          const result = await redis.get(key);
          return result;
        } catch (error) {
          console.error(`Redis GET error for key ${key}:`, error);
          throw error;
        }
      },
      set: async (key: string, value: string, expireInSeconds?: number): Promise<void> => {
        try {
          if (expireInSeconds) {
            await redis.setex(key, expireInSeconds, value);
          } else {
            await redis.set(key, value);
          }
        } catch (error) {
          console.error(`Redis SET error for key ${key}:`, error);
          throw error;
        }
      },
      del: async (key: string): Promise<void> => {
        try {
          await redis.del(key);
        } catch (error) {
          console.error(`Redis DEL error for key ${key}:`, error);
          throw error;
        }
      },
      incr: async (key: string): Promise<number> => {
        try {
          const result = await redis.incr(key);
          return result;
        } catch (error) {
          console.error(`Redis INCR error for key ${key}:`, error);
          throw error;
        }
      },
      expire: async (key: string, seconds: number): Promise<void> => {
        try {
          await redis.expire(key, seconds);
        } catch (error) {
          console.error(`Redis EXPIRE error for key ${key}:`, error);
          throw error;
        }
      },
    };
  } catch (error) {
    console.error("Redis client initialization failed:", error);
    throw new Error(`Failed to create Redis client: ${error}`);
  }
}
