import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, createRateLimitStore, type RateLimitConfig } from "@core/rate-limit/index";
import { getClientIP } from "@core/utils/ip-detection";
import { createProblemResponse, type ProblemDetails } from "@core/api/problem-details";

// レート制限ミドルウェア

/**
 * レート制限ミドルウェア
 * 注意: この関数および内部処理では、署名検証互換性のためにリクエストボディを一切消費しないこと。
 * 署名検証ルートでは `request.text()` を後段で使用するため、ここで `json()` などを呼ばないこと。
 */
export function withRateLimit(config: RateLimitConfig, keyPrefix?: string) {
  return async function (request: NextRequest): Promise<NextResponse<ProblemDetails> | null> {
    // 信頼度ベースでの安全なIPアドレス取得
    const ip = getClientIP(request);
    const store = await createRateLimitStore();
    const result = await checkRateLimit(store, `${keyPrefix || "api"}_${ip}`, config);

    if (!result.allowed) {
      const retryAfter = result.retryAfter || 60;
      const res = createProblemResponse("RATE_LIMITED", {
        instance: request.nextUrl.pathname,
        retryable: true,
      });
      res.headers.set("Retry-After", retryAfter.toString());
      return res;
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
): Promise<NextResponse<ProblemDetails> | null> {
  const middleware = withRateLimit(config, keyPrefix);
  return await middleware(request);
}
