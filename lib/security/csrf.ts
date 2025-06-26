/**
 * CSRF（Cross-Site Request Forgery）保護機能
 * 状態変更操作でのCSRFトークン検証
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// CSRFトークンのCookie名
export const CSRF_TOKEN_COOKIE_NAME = 'csrf-token';
export const CSRF_TOKEN_HEADER_NAME = 'x-csrf-token';

// CSRFトークンの有効期限（24時間）
const CSRF_TOKEN_EXPIRES = 24 * 60 * 60 * 1000;

/**
 * セキュアなCSRFトークンを生成する
 * @returns 生成されたCSRFトークン
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * CSRFトークンを検証する
 * @param providedToken リクエストで提供されたトークン
 * @param sessionToken セッションに保存されているトークン
 * @returns 検証結果
 */
export function validateCSRFToken(providedToken: string, sessionToken: string): boolean {
  if (!providedToken || !sessionToken) {
    return false;
  }

  try {
    // 長さが異なる場合は早期リターン
    if (providedToken.length !== sessionToken.length) {
      return false;
    }

    // タイミング攻撃を防ぐため、timingSafeEqualを使用
    const providedBuffer = Buffer.from(providedToken, 'hex');
    const sessionBuffer = Buffer.from(sessionToken, 'hex');
    
    return timingSafeEqual(providedBuffer, sessionBuffer);
  } catch (error) {
    console.error('CSRF token validation error:', error);
    return false;
  }
}

/**
 * セッションIDからCSRFトークンを生成する（オプション: より強固な実装）
 * @param sessionId セッションID
 * @param timestamp タイムスタンプ
 * @returns 生成されたCSRFトークン
 */
export function generateCSRFTokenFromSession(sessionId: string, timestamp: number = Date.now()): string {
  const secret = process.env.CSRF_SECRET || 'default-csrf-secret';
  const data = `${sessionId}:${timestamp}:${secret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * セッションベースのCSRFトークンを検証する
 * @param providedToken 提供されたトークン
 * @param sessionId セッションID
 * @param maxAge 最大有効期限（ミリ秒）
 * @returns 検証結果
 */
export function validateSessionBasedCSRFToken(
  providedToken: string, 
  sessionId: string, 
  maxAge: number = CSRF_TOKEN_EXPIRES
): boolean {
  if (!providedToken || !sessionId) {
    return false;
  }

  try {
    // 現在時刻から過去maxAge分の範囲でトークンを検証
    const now = Date.now();
    const validTimeRange = Math.ceil(maxAge / (60 * 1000)); // 分単位

    for (let i = 0; i < validTimeRange; i++) {
      const testTimestamp = now - (i * 60 * 1000);
      const expectedToken = generateCSRFTokenFromSession(sessionId, testTimestamp);
      
      if (providedToken === expectedToken) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Session-based CSRF token validation error:', error);
    return false;
  }
}

/**
 * リクエストが状態変更操作かどうかを判定する
 * @param request NextRequestオブジェクト
 * @returns 状態変更操作の場合true
 */
export function isStateChangingRequest(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  
  return stateChangingMethods.includes(method);
}

/**
 * CSRFトークンをCookieに設定する
 * @param response NextResponseオブジェクト
 * @param token CSRFトークン
 * @returns 修正されたNextResponseオブジェクト
 */
export function setCSRFTokenCookie(response: NextResponse, token: string): NextResponse {
  const cookieOptions = {
    httpOnly: false, // JavaScriptから読み取り可能にする（必要に応じて）
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const, // CSRF保護のためstrictに設定
    path: '/',
    maxAge: CSRF_TOKEN_EXPIRES / 1000, // 秒単位
  };

  response.cookies.set(CSRF_TOKEN_COOKIE_NAME, token, cookieOptions);
  return response;
}

/**
 * リクエストからCSRFトークンを取得する
 * @param request NextRequestオブジェクト
 * @returns CSRFトークン（ヘッダーまたはCookieから）
 */
export function getCSRFTokenFromRequest(request: NextRequest): {
  headerToken: string | null;
  cookieToken: string | null;
} {
  const headerToken = request.headers.get(CSRF_TOKEN_HEADER_NAME);
  const cookieToken = request.cookies.get(CSRF_TOKEN_COOKIE_NAME)?.value || null;

  return {
    headerToken,
    cookieToken,
  };
}

/**
 * CSRF保護のエラーレスポンスを作成する
 * @param message エラーメッセージ
 * @returns CSRFエラーレスポンス
 */
export function createCSRFErrorResponse(message: string = 'CSRF token validation failed'): NextResponse {
  return new NextResponse(
    JSON.stringify({
      success: false,
      error: {
        code: 'CSRF_TOKEN_INVALID',
        message,
      },
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}