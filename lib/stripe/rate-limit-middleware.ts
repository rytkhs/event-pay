/**
 * Stripe決済エンドポイント用レート制限ミドルウェア
 * Destination charges対応
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRateLimitStore, checkRateLimit } from '../rate-limit';
import { RATE_LIMIT_CONFIG } from '../../config/security';
import { ApiResponseHelper } from '../api/response';

/**
 * レート制限チェック結果
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfter?: number;
  response?: NextResponse;
}

/**
 * IPアドレス取得ヘルパー
 */
function getClientIP(request: NextRequest): string {
  // Vercel/Cloudflare等のプロキシ環境でのIP取得
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');

  if (cfConnectingIP) return cfConnectingIP;
  if (realIP) return realIP;
  if (forwarded) return forwarded.split(',')[0].trim();

  // フォールバック
  return request.ip || 'unknown';
}

/**
 * Stripe Checkout作成用レート制限チェック
 */
export async function checkStripeCheckoutRateLimit(
  request: NextRequest,
  userId?: string
): Promise<RateLimitCheckResult> {
  try {
    const store = await createRateLimitStore();
    const clientIP = getClientIP(request);

    // ユーザーIDがある場合はユーザー単位、ない場合はIP単位
    const key = userId ? `stripe_checkout:user:${userId}` : `stripe_checkout:ip:${clientIP}`;

    const result = await checkRateLimit(
      store,
      key,
      RATE_LIMIT_CONFIG.stripeCheckout
    );

    if (!result.allowed) {
      return {
        allowed: false,
        retryAfter: result.retryAfter,
        response: ApiResponseHelper.rateLimit(
          'Stripe Checkout作成の試行回数が上限に達しました。しばらく待ってから再試行してください。',
          result.retryAfter
        ),
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Stripe Checkout rate limit check failed:', error);
    // レート制限チェック失敗時は通す（可用性優先）
    return { allowed: true };
  }
}

/**
 * Stripe PaymentIntent作成用レート制限チェック
 */
export async function checkStripePaymentIntentRateLimit(
  request: NextRequest,
  userId?: string
): Promise<RateLimitCheckResult> {
  try {
    const store = await createRateLimitStore();
    const clientIP = getClientIP(request);

    // ユーザーIDがある場合はユーザー単位、ない場合はIP単位
    const key = userId ? `stripe_pi:user:${userId}` : `stripe_pi:ip:${clientIP}`;

    const result = await checkRateLimit(
      store,
      key,
      RATE_LIMIT_CONFIG.stripePaymentIntent
    );

    if (!result.allowed) {
      return {
        allowed: false,
        retryAfter: result.retryAfter,
        response: ApiResponseHelper.rateLimit(
          'Stripe PaymentIntent作成の試行回数が上限に達しました。しばらく待ってから再試行してください。',
          result.retryAfter
        ),
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Stripe PaymentIntent rate limit check failed:', error);
    // レート制限チェック失敗時は通す（可用性優先）
    return { allowed: true };
  }
}

/**
 * 汎用Stripe操作用レート制限チェック
 */
export async function checkStripeOperationRateLimit(
  request: NextRequest,
  operation: string,
  userId?: string
): Promise<RateLimitCheckResult> {
  try {
    const store = await createRateLimitStore();
    const clientIP = getClientIP(request);

    // ユーザーIDがある場合はユーザー単位、ない場合はIP単位
    const key = userId ? `stripe_${operation}:user:${userId}` : `stripe_${operation}:ip:${clientIP}`;

    const result = await checkRateLimit(
      store,
      key,
      RATE_LIMIT_CONFIG.general
    );

    if (!result.allowed) {
      return {
        allowed: false,
        retryAfter: result.retryAfter,
        response: ApiResponseHelper.rateLimit(
          `Stripe ${operation}操作の試行回数が上限に達しました。しばらく待ってから再試行してください。`,
          result.retryAfter
        ),
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error(`Stripe ${operation} rate limit check failed:`, error);
    // レート制限チェック失敗時は通す（可用性優先）
    return { allowed: true };
  }
}

/**
 * レート制限ミドルウェア関数
 * Next.js API Routeで使用
 */
export function withStripeRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  operation: 'checkout' | 'payment_intent' | string = 'general'
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let rateLimitResult: RateLimitCheckResult;

    // 操作タイプに応じたレート制限チェック
    switch (operation) {
      case 'checkout':
        rateLimitResult = await checkStripeCheckoutRateLimit(request);
        break;
      case 'payment_intent':
        rateLimitResult = await checkStripePaymentIntentRateLimit(request);
        break;
      default:
        rateLimitResult = await checkStripeOperationRateLimit(request, operation);
        break;
    }

    // レート制限に引っかかった場合
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response;
    }

    // 通常処理を実行
    return await handler(request);
  };
}
