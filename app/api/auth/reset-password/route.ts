/**
 * パスワードリセット要求 API エンドポイント (AUTH-004)
 * POST /api/auth/reset-password
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

// 入力値バリデーションスキーマ
const resetPasswordSchema = z.object({
  email: z
    .string()
    .email('有効なメールアドレスを入力してください')
    .min(1, 'メールアドレスを入力してください'),
});

// レート制限の設定（IP単位で15分間に3回まで）
const ratelimit = process.env.RATE_LIMIT_REDIS_URL ? new Ratelimit({
  redis: new Redis({
    url: process.env.RATE_LIMIT_REDIS_URL!,
    token: process.env.RATE_LIMIT_REDIS_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(3, '15 m'),
  analytics: true,
}) : null;

export async function POST(request: NextRequest) {
  try {
    // レート制限チェック
    if (ratelimit) {
      const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
      const { success, limit, reset, remaining } = await ratelimit.limit(`reset_password_${ip}`);

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
    const validationResult = resetPasswordSchema.safeParse(body);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      return NextResponse.json(
        {
          success: false,
          error: {
            code: firstError.path[0] === 'email' ? 'INVALID_EMAIL' : 'MISSING_EMAIL',
            message: firstError.message,
          },
        },
        { status: 400 }
      );
    }

    const { email } = validationResult.data;

    // Supabaseクライアントの作成
    const supabase = createClient();

    // パスワードリセットメール送信
    // セキュリティ上、存在しないメールアドレスでもエラーを返さない（ユーザー列挙攻撃対策）
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
    });

    // タイミング攻撃対策のため、一定の遅延を追加
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    if (error) {
      console.error('Password reset error:', error);
      // エラーが発生してもセキュリティ上、成功レスポンスを返す
    }

    return NextResponse.json(
      {
        success: true,
        message: 'パスワードリセットメールを送信しました。メールをご確認ください。',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Password reset error:', error);

    // タイミング攻撃対策のため、エラー時も一定の遅延
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'サービスが一時的に利用できません。しばらく時間をおいて再試行してください。',
        },
      },
      { status: 500 }
    );
  }
}