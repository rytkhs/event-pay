/**
 * Cookie管理ユーティリティ
 * Supabase認証関連Cookieの統一管理
 */

import { NextResponse } from 'next/server';

// Supabase関連Cookie名の定数定義
export const SUPABASE_COOKIE_NAMES = [
  'supabase-auth-token',
  'supabase-refresh-token',
  'supabase-auth-token-code-verifier',
  'sb-access-token',
  'sb-refresh-token',
  'sb-provider-token',
  'sb-provider-refresh-token',
] as const;

// Cookie削除時の設定オプション
export const COOKIE_DELETE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 0, // 即座に削除
  expires: new Date(0), // 確実に削除
};

/**
 * 全てのSupabase関連Cookieを削除する
 * @param response NextResponseオブジェクト
 * @returns 修正されたNextResponseオブジェクト
 */
export function clearAllSupabaseCookies(response: NextResponse): NextResponse {
  SUPABASE_COOKIE_NAMES.forEach(cookieName => {
    response.cookies.set(cookieName, '', COOKIE_DELETE_OPTIONS);
  });
  
  return response;
}

/**
 * 特定のSupabase関連Cookieを削除する
 * @param response NextResponseオブジェクト
 * @param cookieNames 削除するCookie名の配列
 * @returns 修正されたNextResponseオブジェクト
 */
export function clearSpecificCookies(
  response: NextResponse, 
  cookieNames: (typeof SUPABASE_COOKIE_NAMES[number])[]
): NextResponse {
  cookieNames.forEach(cookieName => {
    if (SUPABASE_COOKIE_NAMES.includes(cookieName)) {
      response.cookies.set(cookieName, '', COOKIE_DELETE_OPTIONS);
    }
  });
  
  return response;
}

/**
 * セッション関連Cookieのみを削除する（基本的な認証Cookie）
 * @param response NextResponseオブジェクト
 * @returns 修正されたNextResponseオブジェクト
 */
export function clearSessionCookies(response: NextResponse): NextResponse {
  const sessionCookieNames = [
    'supabase-auth-token',
    'supabase-refresh-token',
    'supabase-auth-token-code-verifier',
  ] as const;
  
  return clearSpecificCookies(response, sessionCookieNames as any);
}

/**
 * レスポンス作成時にCookie削除を適用する汎用ヘルパー
 * @param jsonResponse JSONレスポンスオブジェクト
 * @param status HTTPステータスコード
 * @param clearAllCookies 全Cookie削除フラグ（デフォルト: true）
 * @returns Cookie削除設定済みのNextResponseオブジェクト
 */
export function createResponseWithCookieCleanup(
  jsonResponse: any,
  status: number,
  clearAllCookies: boolean = true
): NextResponse {
  const response = NextResponse.json(jsonResponse, { status });
  
  if (clearAllCookies) {
    return clearAllSupabaseCookies(response);
  } else {
    return clearSessionCookies(response);
  }
}