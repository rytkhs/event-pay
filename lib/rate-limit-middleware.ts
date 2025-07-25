import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, createRateLimitStore, type RateLimitConfig } from "@/lib/rate-limit/index";

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
    const ip =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const store = await createRateLimitStore();
    const result = await checkRateLimit(store, `${keyPrefix || "api"}_${ip}`, config);

    if (!result.allowed) {
      const retryAfter = result.retryAfter || 60;

      const errorResponse: RateLimitErrorResponse = {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "レート制限に達しました。しばらく待ってから再試行してください。",
          retryAfter,
        },
      };

      return NextResponse.json(errorResponse, {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
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
