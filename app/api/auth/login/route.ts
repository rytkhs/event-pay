/**
 * ログイン API エンドポイント (AUTH-003)
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

// 入力値バリデーションスキーマ
const loginSchema = z.object({
  email: z
    .string()
    .email('有効なメールアドレスを入力してください')
    .min(1, 'メールアドレスを入力してください'),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .max(128, 'パスワードは128文字以内で入力してください'),
});

// レート制限の設定（IP単位で5分間に5回まで）
const ratelimit = process.env.RATE_LIMIT_REDIS_URL ? new Ratelimit({
  redis: new Redis({
    url: process.env.RATE_LIMIT_REDIS_URL!,
    token: process.env.RATE_LIMIT_REDIS_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(5, '5 m'),
  analytics: true,
}) : null;

export async function POST(request: NextRequest) {
  try {
    // レート制限チェック
    if (ratelimit) {
      const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
      const { success, limit, reset, remaining } = await ratelimit.limit(`login_${ip}`);

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

      // レート制限ヘッダーを設定
      const headers = {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      };
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
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      return NextResponse.json(
        {
          success: false,
          error: {
            code: firstError.path[0] === 'email' ? 'INVALID_EMAIL' : 'WEAK_PASSWORD',
            message: firstError.message,
          },
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // Supabaseクライアントの作成
    const supabase = createClient();

    // ログイン試行
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      // セキュリティ上、具体的なエラー内容は隠す（ユーザー列挙攻撃対策）
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'メールアドレスまたはパスワードが正しくありません',
          },
        },
        { status: 401 }
      );
    }

    // メール未確認の場合
    if (!data.user.email_confirmed_at) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMAIL_NOT_CONFIRMED',
            message: 'メールアドレスの確認が完了していません。確認メールをご確認ください。',
          },
        },
        { status: 403 }
      );
    }

    // usersテーブルとの同期（Service Role Keyを使用）
    try {
      const serviceClient = createServiceClient();
      const { error: syncError } = await serviceClient
        .from('users')
        .upsert({
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.full_name || data.user.email!.split('@')[0],
        })
        .select();

      if (syncError) {
        console.error('User sync error:', syncError);
        // 同期エラーは重要ではないため、ログイン成功は継続
      }
    } catch (syncError) {
      console.error('User sync failed:', syncError);
    }

    // セッションCookieの設定
    const response = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email!.split('@')[0],
          },
          session: data.session,
        },
        message: 'ログインに成功しました',
      },
      { status: 200 }
    );

    // HTTPOnly Cookieの設定
    if (data.session) {
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
    console.error('Login error:', error);

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