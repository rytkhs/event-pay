/**
 * ログイン API エンドポイント (AUTH-003)
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  getHTTPStatusFromErrorCode,
} from "@/lib/api/error-codes";
import {
  createRateLimitInstance,
  executeRateLimit,
  getClientIP,
} from "@/lib/security/rate-limit-config";

// 入力値バリデーションスキーマ
const loginSchema = z.object({
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .min(1, "メールアドレスを入力してください"),
  password: z
    .string()
    .min(8, "パスワードは8文字以上で入力してください")
    .max(128, "パスワードは128文字以内で入力してください"),
});

// レート制限の設定（IP単位で15分間に10回まで）
const rateLimitConfig = createRateLimitInstance();

export async function POST(request: NextRequest) {
  try {
    // レート制限チェック
    const clientIP = getClientIP(request);
    const rateLimitResult = await executeRateLimit(rateLimitConfig.instance, `login_${clientIP}`);

    if (!rateLimitResult.success) {
      const errorResponse = createErrorResponse(ERROR_CODES.SECURITY.RATE_LIMIT_EXCEEDED);
      return NextResponse.json(errorResponse, {
        status: getHTTPStatusFromErrorCode(ERROR_CODES.SECURITY.RATE_LIMIT_EXCEEDED),
        headers: rateLimitResult.headers,
      });
    }

    // リクエストボディの解析
    const body = await request.json().catch(() => null);
    if (!body) {
      const errorResponse = createErrorResponse(ERROR_CODES.VALIDATION.INVALID_JSON);
      return NextResponse.json(errorResponse, {
        status: getHTTPStatusFromErrorCode(ERROR_CODES.VALIDATION.INVALID_JSON),
      });
    }

    // 入力値のバリデーション
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      const errorCode =
        firstError.path[0] === "email"
          ? ERROR_CODES.VALIDATION.INVALID_EMAIL
          : ERROR_CODES.VALIDATION.WEAK_PASSWORD;

      const errorResponse = createErrorResponse(errorCode, firstError.message);
      return NextResponse.json(errorResponse, { status: getHTTPStatusFromErrorCode(errorCode) });
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
      const errorResponse = createErrorResponse(ERROR_CODES.AUTH.INVALID_CREDENTIALS);
      return NextResponse.json(errorResponse, {
        status: getHTTPStatusFromErrorCode(ERROR_CODES.AUTH.INVALID_CREDENTIALS),
      });
    }

    // メール未確認の場合
    if (!data.user.email_confirmed_at) {
      const errorResponse = createErrorResponse(ERROR_CODES.AUTH.EMAIL_NOT_CONFIRMED);
      return NextResponse.json(errorResponse, {
        status: getHTTPStatusFromErrorCode(ERROR_CODES.AUTH.EMAIL_NOT_CONFIRMED),
      });
    }

    // usersテーブルとの同期（Service Role Keyを使用）
    try {
      const serviceClient = createServiceClient();
      const { error: syncError } = await serviceClient
        .from("users")
        .upsert({
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.full_name || data.user.email!.split("@")[0],
        })
        .select();

      if (syncError) {
        console.error("User sync error:", syncError);
        // 同期エラーは重要ではないため、ログイン成功は継続
      }
    } catch (syncError) {
      console.error("User sync failed:", syncError);
    }

    // セッションCookieの設定
    const successResponse = createSuccessResponse(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email!.split("@")[0],
        },
        session: data.session,
      },
      "ログインに成功しました"
    );

    const response = NextResponse.json(successResponse, {
      status: 200,
      headers: rateLimitResult.headers, // レート制限ヘッダーを含める
    });

    // HTTPOnly Cookieの設定
    if (data.session) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 60 * 60 * 24, // 24時間
        path: "/",
      };

      response.cookies.set("supabase-auth-token", data.session.access_token, cookieOptions);
      if (data.session.refresh_token) {
        response.cookies.set("supabase-refresh-token", data.session.refresh_token, cookieOptions);
      }
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);

    const errorResponse = createErrorResponse(
      ERROR_CODES.SERVER.INTERNAL_ERROR,
      "サーバーエラーが発生しました。しばらく時間をおいて再試行してください。"
    );

    return NextResponse.json(errorResponse, {
      status: getHTTPStatusFromErrorCode(ERROR_CODES.SERVER.INTERNAL_ERROR),
    });
  }
}
