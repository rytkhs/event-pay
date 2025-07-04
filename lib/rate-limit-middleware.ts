import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RateLimitConfig } from "./rate-limit";

// レート制限エラーレスポンス用の型定義
interface RateLimitErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    retryAfter?: number;
  };
}

// レート制限ミドルウェア
export function withRateLimit(config: RateLimitConfig, keyPrefix?: string) {
  return async function (request: NextRequest) {
    const result = await checkRateLimit(request, config, keyPrefix);

    if (!result.success) {
      const retryAfter = Math.round((result.reset - Date.now()) / 1000);

      const errorResponse: RateLimitErrorResponse = {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "レート制限に達しました。しばらく待ってから再試行してください。",
          retryAfter: retryAfter > 0 ? retryAfter : 60, // デフォルト60秒
        },
      };

      return NextResponse.json(errorResponse, {
        status: 429,
        headers: {
          "X-RateLimit-Limit": result.limit.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.reset.toString(),
          "Retry-After": (retryAfter > 0 ? retryAfter : 60).toString(),
        },
      });
    }

    // レート制限通過時にはnullを返して処理続行を示す
    return null;
  };
}

// API Route用のレート制限ヘルパー
export async function handleRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  keyPrefix?: string
): Promise<NextResponse | null> {
  const middleware = withRateLimit(config, keyPrefix);
  return await middleware(request);
}

// 成功レスポンスにレート制限ヘッダーを追加
export async function addRateLimitHeaders(
  request: NextRequest,
  response: NextResponse,
  config: RateLimitConfig,
  keyPrefix?: string
): Promise<NextResponse> {
  try {
    const result = await checkRateLimit(request, config, keyPrefix);

    // 既存のヘッダーを保持してレート制限ヘッダーを追加
    response.headers.set("X-RateLimit-Limit", result.limit.toString());
    response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
    response.headers.set("X-RateLimit-Reset", result.reset.toString());

    return response;
  } catch {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      // console.error("Failed to add rate limit headers:", _);
    }
    return response;
  }
}
