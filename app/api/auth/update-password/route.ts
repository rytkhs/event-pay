/**
 * パスワード更新 API エンドポイント (AUTH-004)
 * POST /api/auth/update-password
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// 入力値バリデーションスキーマ
const updatePasswordSchema = z.object({
  access_token: z.string().min(1, 'アクセストークンが必要です'),
  refresh_token: z.string().min(1, 'リフレッシュトークンが必要です'),
  new_password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .max(128, 'パスワードは128文字以内で入力してください')
    .regex(/(?=.*[a-zA-Z])(?=.*[0-9])/, 'パスワードは英字と数字を含める必要があります'),
});

/**
 * パスワード強度チェック
 */
function checkPasswordStrength(password: string): { isValid: boolean; message?: string } {
  const commonPasswords = [
    'password', '123456', 'qwerty', 'admin', 'letmein',
    'welcome', 'monkey', 'dragon', 'password123', '123456789',
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    return {
      isValid: false,
      message: '一般的なパスワードは使用できません。より複雑なパスワードを設定してください。',
    };
  }

  return { isValid: true };
}

export async function POST(request: NextRequest) {
  try {
    // リクエストボディの解析
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '有効なJSONを送信してください',
          },
        },
        { status: 400 }
      );
    }

    // 入力値のバリデーション
    const validationResult = updatePasswordSchema.safeParse(body);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      const errorCode = 
        firstError.path[0] === 'new_password' ? 'WEAK_PASSWORD' :
        firstError.path[0] === 'access_token' || firstError.path[0] === 'refresh_token' ? 'MISSING_TOKEN' :
        'MISSING_PASSWORD';

      return NextResponse.json(
        {
          success: false,
          error: {
            code: errorCode,
            message: firstError.message,
          },
        },
        { status: 400 }
      );
    }

    const { access_token, refresh_token, new_password } = validationResult.data;

    // パスワード強度チェック
    const passwordCheck = checkPasswordStrength(new_password);
    if (!passwordCheck.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: passwordCheck.message!,
          },
        },
        { status: 400 }
      );
    }

    // Supabaseクライアントの作成
    const supabase = createClient();

    // リセットトークンでセッションを設定
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError || !sessionData.user) {
      if (sessionError?.message?.includes('expired')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'TOKEN_EXPIRED',
              message: 'リセットトークンの有効期限が切れています。再度パスワードリセットを行ってください。',
            },
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: '無効なリセットトークンです',
          },
        },
        { status: 401 }
      );
    }

    // パスワード更新
    const { data, error } = await supabase.auth.updateUser({
      password: new_password,
    });

    if (error) {
      console.error('Password update error:', error);
      
      if (error.message.includes('same as current')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'SAME_PASSWORD',
              message: '現在のパスワードと同じパスワードは設定できません',
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: 'パスワードの更新に失敗しました。再試行してください。',
          },
        },
        { status: 500 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: 'パスワードの更新に失敗しました',
          },
        },
        { status: 500 }
      );
    }

    // レスポンスの作成
    const response = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
          },
        },
        message: 'パスワードを更新しました',
      },
      { status: 200 }
    );

    // 新しいセッションCookieを設定
    if (sessionData.session) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 60 * 60 * 24, // 24時間
        path: '/',
      };

      response.cookies.set('supabase-auth-token', sessionData.session.access_token, cookieOptions);
      if (sessionData.session.refresh_token) {
        response.cookies.set('supabase-refresh-token', sessionData.session.refresh_token, cookieOptions);
      }
    }

    return response;
  } catch (error) {
    console.error('Password update error:', error);

    // ネットワークエラーの場合
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'サーバーエラーが発生しました。しばらく時間をおいて再試行してください。',
        },
      },
      { status: 500 }
    );
  }
}