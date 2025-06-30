import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getClientIP } from "@/lib/utils/ip-detection";

// バリデーションスキーマ（より厳密）
const resendSchema = z.object({
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .min(5, "メールアドレスが短すぎます")
    .max(254, "メールアドレスが長すぎます") // RFC 5321準拠
    .toLowerCase()
    .trim(),
});

// レート制限設定（より厳格）
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, "1 h"), // 1時間に3回まで
  analytics: true,
});

// 追加のレート制限（メールアドレス別）
const emailRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "24 h"), // 24時間に5回まで
  analytics: true,
});

// セキュリティヘルパー関数
const validateCSRF = (request: NextRequest): boolean => {
  const origin = request.headers.get("origin");
  const xRequestedWith = request.headers.get("x-requested-with");
  const referer = request.headers.get("referer");

  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000",
    "https://localhost:3000",
  ].filter(Boolean) as string[];

  // 複数の CSRF チェック
  if (!origin || !allowedOrigins.includes(origin)) {
    return false;
  }

  if (xRequestedWith !== "XMLHttpRequest") {
    return false;
  }

  if (!referer) {
    return false;
  }

  // refererが存在することは上でチェック済み
  const safeReferer = referer as string;
  return allowedOrigins.some((allowed) => safeReferer.startsWith(allowed));
};

// エラーレスポンスヘルパー
const createErrorResponse = (error: string, status: number = 400) => {
  return NextResponse.json(
    { success: false, error },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    }
  );
};

// 成功レスポンスヘルパー
const createSuccessResponse = (message: string, data?: Record<string, unknown>) => {
  return NextResponse.json(
    { success: true, message, ...data },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    }
  );
};

export async function POST(request: NextRequest) {
  try {
    // CSRF保護
    if (!validateCSRF(request)) {
      // セキュリティログ - 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.warn("CSRF protection triggered", {
          origin: request.headers.get("origin"),
          xRequestedWith: request.headers.get("x-requested-with"),
          referer: request.headers.get("referer"),
          timestamp: new Date().toISOString(),
        });
      }
      return createErrorResponse("CSRF protection: リクエストが無効です", 403);
    }

    // リクエストボディサイズチェック（DoS攻撃対策）
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 1024) {
      // 1KB制限
      return createErrorResponse("リクエストサイズが大きすぎます", 413);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse("不正なJSONフォーマットです", 400);
    }

    // 入力バリデーション
    const validation = resendSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors[0]?.message || "入力データが無効です";
      return createErrorResponse(errorMessage, 400);
    }

    const { email } = validation.data;

    // IPアドレス取得（統一実装使用）
    const ip = getClientIP(request);

    // レート制限チェック（IP別）
    const ipRateLimitKey = `resend_ip_${ip}`;
    const { success: ipRateLimitSuccess, remaining: ipRemaining } =
      await ratelimit.limit(ipRateLimitKey);

    if (!ipRateLimitSuccess) {
      // セキュリティログ - 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.warn("IP rate limit exceeded", { ip, email, timestamp: new Date().toISOString() });
      }
      return createErrorResponse(
        `送信回数の上限に達しました。1時間後に再度お試しください。（残り試行回数: 0）`,
        429
      );
    }

    // レート制限チェック（メールアドレス別）
    const emailRateLimitKey = `resend_email_${email}`;
    const { success: emailRateLimitSuccess, remaining: emailRemaining } =
      await emailRatelimit.limit(emailRateLimitKey);

    if (!emailRateLimitSuccess) {
      // セキュリティログ - 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.warn("Email rate limit exceeded", {
          email,
          ip,
          timestamp: new Date().toISOString(),
        });
      }
      return createErrorResponse(
        `このメールアドレスの送信回数上限に達しました。24時間後に再度お試しください。`,
        429
      );
    }

    // Supabaseクライアント初期化（エラーハンドリング強化）
    let supabase;
    try {
      const cookieStore = cookies();
      supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
            set(name: string, value: string, options: Record<string, unknown>) {
              cookieStore.set({ name, value, ...options });
            },
            remove(name: string, options: Record<string, unknown>) {
              cookieStore.set({ name, value: "", ...options });
            },
          },
        }
      );
    } catch (error) {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.error("Supabase client initialization error:", error);
      }
      return createErrorResponse("認証サービスの初期化に失敗しました", 500);
    }

    // 確認メール再送信（タイムアウト対策）
    try {
      const resendPromise = supabase.auth.resend({
        type: "signup",
        email,
      });

      // 30秒タイムアウト
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), 30000);
      });

      const { error } = (await Promise.race([resendPromise, timeoutPromise])) as {
        error?: { message: string };
      };

      if (error) {
        // 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          console.error("Supabase resend error:", {
            error: error.message,
            email,
            ip,
            timestamp: new Date().toISOString(),
          });
        }

        // レート制限は明確にエラーとして返す（セキュリティ上重要）
        if (error.message.includes("rate limit") || error.message.includes("too many")) {
          return createErrorResponse(
            "送信回数の上限に達しました。しばらく時間をおいてからお試しください。",
            429
          );
        }

        // その他のエラーはメール列挙攻撃防止のため成功として返す
        // 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          console.error("Supabase resend error details:", {
            error: error.message,
            email: email.replace(/(.{2}).*(@.*)/, "$1***$2"), // ログでのメールマスク
            ip,
            timestamp: new Date().toISOString(),
          });
        }

        // タイミング正規化のため少し待機
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 500 + 500));

        // アカウント存在有無に関わらず同じメッセージを返す（メール列挙攻撃防止）
        return createSuccessResponse(
          "アカウントが存在する場合、確認メールを再送信しました。メールが届かない場合は迷惑メールフォルダもご確認ください。"
        );
      }

      // 成功ログ - 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.info("Email resend successful", {
          email,
          ip,
          ipRemaining,
          emailRemaining,
          timestamp: new Date().toISOString(),
        });
      }

      return createSuccessResponse(
        "確認メールを再送信しました。メールが届かない場合は迷惑メールフォルダもご確認ください。",
        {
          remainingAttempts: {
            ip: ipRemaining,
            email: emailRemaining,
          },
        }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Timeout") {
        // 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          console.error("Email resend timeout", { email, ip, timestamp: new Date().toISOString() });
        }
        return createErrorResponse(
          "リクエストがタイムアウトしました。しばらく時間をおいてからお試しください。",
          504
        );
      }

      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.error("Unexpected error during email resend:", error);
      }
      return createErrorResponse("予期しないエラーが発生しました", 500);
    }
  } catch (error) {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.error("Critical error in resend-confirmation:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    return createErrorResponse("サーバーエラーが発生しました", 500);
  }
}

// OPTIONS メソッドの対応（CORS対策）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
      "Access-Control-Max-Age": "86400", // 24時間
    },
  });
}
