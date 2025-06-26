/**
 * ログアウト API エンドポイント (AUTH-003)
 * POST /api/auth/logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createResponseWithCookieCleanup } from '@/lib/auth/cookie-manager';
import { 
  ERROR_CODES, 
  createErrorResponse, 
  createSuccessResponse, 
  getHTTPStatusFromErrorCode 
} from '@/lib/api/error-codes';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // 現在のユーザーを取得して認証状態を確認
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!user || userError) {
      const errorResponse = createErrorResponse(ERROR_CODES.AUTH.NOT_AUTHENTICATED);
      return NextResponse.json(
        errorResponse,
        { status: getHTTPStatusFromErrorCode(ERROR_CODES.AUTH.NOT_AUTHENTICATED) }
      );
    }

    // Supabaseからログアウト
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      const errorResponse = createErrorResponse(ERROR_CODES.AUTH.LOGOUT_FAILED);
      return NextResponse.json(
        errorResponse,
        { status: getHTTPStatusFromErrorCode(ERROR_CODES.AUTH.LOGOUT_FAILED) }
      );
    }

    // レスポンスの作成（Cookie削除を含む）
    const successResponse = createSuccessResponse(
      {},
      'ログアウトしました'
    );
    
    return createResponseWithCookieCleanup(
      successResponse,
      200
    );
  } catch (error) {
    console.error('Logout error:', error);

    // エラーが発生してもCookieは削除する（セキュリティ重視）
    const errorResponse = createErrorResponse(ERROR_CODES.SERVER.INTERNAL_ERROR);
    return createResponseWithCookieCleanup(
      errorResponse,
      getHTTPStatusFromErrorCode(ERROR_CODES.SERVER.INTERNAL_ERROR)
    );
  }
}