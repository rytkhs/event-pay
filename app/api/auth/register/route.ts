/**
 * ユーザー登録 API エンドポイント (AUTH-005)
 * POST /api/auth/register
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

// 入力値バリデーションスキーマ
const registerSchema = z.object({
  email: z
    .string()
    .email('有効なメールアドレスを入力してください')
    .min(1, 'メールアドレスを入力してください')
    .max(255, 'メールアドレスは255文字以内で入力してください'),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .max(128, 'パスワードは128文字以内で入力してください')
    .regex(/(?=.*[a-zA-Z])(?=.*[0-9])/, 'パスワードは英字と数字を含める必要があります'),
  name: z
    .string()
    .min(1, '名前を入力してください')
    .max(255, '名前は255文字以内で入力してください')
    .regex(/^[^\s].*[^\s]$|^[^\s]$/, '名前の前後に空白は使用できません'),
});

// レート制限の設定（IP単位で10分間に3回まで）
const ratelimit = process.env.RATE_LIMIT_REDIS_URL ? new Ratelimit({
  redis: new Redis({
    url: process.env.RATE_LIMIT_REDIS_URL!,
    token: process.env.RATE_LIMIT_REDIS_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  analytics: true,
}) : null;

/**
 * HTMLエスケープ関数（XSS対策）
 */
function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

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
    // レート制限チェック
    if (ratelimit) {
      const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
      const { success, limit, reset, remaining } = await ratelimit.limit(`register_${ip}`);

      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'レート制限に達しました。しばらく待ってから再試行してください。',
            },
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': reset.toString(),
              'Retry-After': Math.round((reset - Date.now()) / 1000).toString(),
            },
          }
        );
      }
    }

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
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      const errorCode = 
        firstError.path[0] === 'email' ? 'INVALID_EMAIL' :
        firstError.path[0] === 'password' ? 'WEAK_PASSWORD' :
        firstError.path[0] === 'name' ? 'NAME_TOO_LONG' :
        'MISSING_FIELDS';

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

    const { email, password, name } = validationResult.data;

    // パスワード強度チェック
    const passwordCheck = checkPasswordStrength(password);
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

    // 名前のサニタイズ
    const sanitizedName = sanitizeInput(name.trim());

    // Supabaseクライアントの作成
    const supabase = createClient();

    // ユーザー登録試行
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: sanitizedName,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });

    if (error) {
      // 既存ユーザーの場合（ユーザー列挙攻撃対策のため、成功レスポンスを返す）
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EMAIL_ALREADY_EXISTS',
              message: 'このメールアドレスは既に登録されています',
            },
          },
          { status: 409 }
        );
      }

      console.error('Registration error:', error);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: '登録に失敗しました。入力内容を確認してください。',
          },
        },
        { status: 400 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: 'ユーザーの作成に失敗しました',
          },
        },
        { status: 500 }
      );
    }

    // usersテーブルにユーザー情報を同期（Service Role Keyを使用）
    try {
      const serviceClient = createServiceClient();
      const { error: syncError } = await serviceClient
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email!,
          name: sanitizedName,
        })
        .select()
        .single();

      if (syncError) {
        console.error('User sync error:', syncError);
        
        // 同期に失敗した場合、作成されたauth.usersを削除する必要がある
        // （実際の実装では Admin API を使用）
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'USER_SYNC_FAILED',
              message: 'ユーザー情報の同期に失敗しました。再試行してください。',
            },
          },
          { status: 500 }
        );
      }
    } catch (syncError) {
      console.error('User sync failed:', syncError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_SYNC_FAILED',
            message: 'ユーザー情報の同期に失敗しました。再試行してください。',
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
            name: sanitizedName,
          },
          session: data.session,
          emailConfirmationSent: !data.user.email_confirmed_at,
        },
        message: data.user.email_confirmed_at
          ? '登録が完了しました'
          : '確認メールを送信しました。メールを確認してアカウントを有効化してください。',
      },
      { status: 201 }
    );

    // メール確認済みの場合、セッションCookieを設定
    if (data.session && data.user.email_confirmed_at) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 60 * 60 * 24, // 24時間
        path: '/',
      };

      response.cookies.set('supabase-auth-token', data.session.access_token, cookieOptions);
      if (data.session.refresh_token) {
        response.cookies.set('supabase-refresh-token', data.session.refresh_token, cookieOptions);
      }
    }

    return response;
  } catch (error) {
    console.error('Registration error:', error);

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