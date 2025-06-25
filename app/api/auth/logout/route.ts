/**
 * ログアウト API エンドポイント (AUTH-003)
 * POST /api/auth/logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // 現在のユーザーを取得して認証状態を確認
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!user || userError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: '認証が必要です',
          },
        },
        { status: 401 }
      );
    }

    // Supabaseからログアウト
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LOGOUT_FAILED',
            message: 'ログアウトに失敗しました。再試行してください。',
          },
        },
        { status: 500 }
      );
    }

    // レスポンスの作成
    const response = NextResponse.json(
      {
        success: true,
        message: 'ログアウトしました',
      },
      { status: 200 }
    );

    // 認証関連のCookieを削除
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 0, // 即座に削除
    };

    response.cookies.set('supabase-auth-token', '', cookieOptions);
    response.cookies.set('supabase-refresh-token', '', cookieOptions);
    
    // その他の認証関連Cookieも削除
    response.cookies.set('supabase-auth-token-code-verifier', '', cookieOptions);

    return response;
  } catch (error) {
    console.error('Logout error:', error);

    // エラーが発生してもCookieは削除する（セキュリティ重視）
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'サーバーエラーが発生しました',
        },
      },
      { status: 500 }
    );

    // エラー時でもCookieを削除
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 0,
    };

    response.cookies.set('supabase-auth-token', '', cookieOptions);
    response.cookies.set('supabase-refresh-token', '', cookieOptions);

    return response;
  }
}