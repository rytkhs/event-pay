/**
 * @file レート制限ユーティリティ
 * @description Redis ベースのレート制限機能
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Redis クライアントの初期化
const createRedisClient = () => {
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL;
  const redisToken = process.env.RATE_LIMIT_REDIS_TOKEN;

  if (!redisUrl || !redisToken) {
    // 開発環境ではRedisが無くても動作するように
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️ Redis設定が見つかりません。レート制限は無効化されます。");
      return null;
    }
    throw new Error("Redis設定が必要です: RATE_LIMIT_REDIS_URL, RATE_LIMIT_REDIS_TOKEN");
  }

  return new Redis({
    url: redisUrl,
    token: redisToken,
  });
};

// レート制限インスタンスの作成
const createRateLimiter = () => {
  const redis = createRedisClient();

  if (!redis) {
    // Redis が利用できない場合のモックレート制限（実際の制限値と同じ）
    return {
      limit: async () => ({
        success: true,
        limit: 10,
        remaining: 9,
        reset: new Date(Date.now() + 10 * 1000), // 10秒後
      }),
    };
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "10 s"), // 10秒間に10回まで
    analytics: true,
  });
};

// API エンドポイント用のレート制限
export const apiRateLimit = createRateLimiter();

// 認証試行用のより厳しいレート制限
export const authRateLimit = (() => {
  const redis = createRedisClient();

  if (!redis) {
    return {
      limit: async () => ({
        success: true,
        limit: 5,
        remaining: 4,
        reset: new Date(Date.now() + 5 * 60 * 1000), // 5分後
      }),
    };
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "5 m"), // 5分間に5回まで
    analytics: true,
  });
})();

/**
 * IPアドレスベースのレート制限チェック
 */
export async function checkRateLimit(
  identifier: string,
  limiter = apiRateLimit
) {
  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error("レート制限チェック中にエラーが発生しました:", error);
    // エラー時はレート制限を通す（可用性を優先）
    return {
      success: true,
      limit: 1000,
      remaining: 999,
      reset: new Date(Date.now() + 60000),
    };
  }
}

/**
 * Next.js API ルート用のレート制限ミドルウェア
 */
export function createRateLimitMiddleware(limiter = apiRateLimit) {
  return async function rateLimitMiddleware(req: Request) {
    // クライアントIPの取得
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0] : "127.0.0.1";

    const result = await checkRateLimit(ip, limiter);

    return {
      ...result,
      headers: {
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": (typeof result.reset === 'number' ? result.reset : result.reset.getTime()).toString(),
      },
    };
  };
}