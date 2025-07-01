"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { InputSanitizer, TimingAttackProtection } from "@/lib/auth-security";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { RegistrationService } from "@/lib/services/registration";
import { LoginService } from "@/lib/services/login";
import { PasswordResetService } from "@/lib/services/password-reset";
import { LogoutService } from "@/lib/services/logout";
import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

// Zodバリデーションスキーマ
const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
  password: z.string().min(1, "パスワードは必須です").max(128),
  rememberMe: z.boolean().optional().default(false),
});

const registerSchema = z
  .object({
    name: z.string().min(1, "名前は必須です").max(100, "名前は100文字以内で入力してください"),
    email: z.string().email("有効なメールアドレスを入力してください").max(254),
    password: z
      .string()
      .min(8, "パスワードは8文字以上である必要があります")
      .max(128, "パスワードは128文字以内である必要があります")
      .regex(
        /^(?=.*[A-Za-z\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf])(?=.*\d)/,
        "パスワードには文字と数字を含む必要があります"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

const resetPasswordSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
});

// Server Action Result型定義
type ServerActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectUrl?: string;
  needsEmailConfirmation?: boolean;
};

// FormDataからオブジェクトに変換するヘルパー
function formDataToObject(formData: FormData): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "rememberMe") {
      data[key] = value === "on" || value === "true";
    } else {
      data[key] = value.toString();
    }
  }
  return data;
}

// IPアドレス取得ヘルパー
function getClientIP(): string {
  try {
    // Next.js 14 App Router Server Actionsでのヘッダー取得
    const headersList = headers();

    // プロキシ経由の場合のIP取得を優先
    const forwardedFor = headersList.get("x-forwarded-for");
    if (forwardedFor) {
      // 複数のIPがある場合は最初のもの（クライアントIP）を使用
      return forwardedFor.split(",")[0].trim();
    }

    // Cloudflareなどの場合
    const realIP = headersList.get("x-real-ip");
    if (realIP) {
      return realIP.trim();
    }

    // CF-Connecting-IP (Cloudflare)
    const cfConnectingIP = headersList.get("cf-connecting-ip");
    if (cfConnectingIP) {
      return cfConnectingIP.trim();
    }

    // デフォルト値
    return "127.0.0.1";
  } catch (error) {
    console.warn("Failed to get client IP:", error);
    return "127.0.0.1";
  }
}

// 認証済みユーザーID取得ヘルパー
async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.warn("Failed to get current user ID:", error);
    return null;
  }
}

// Server Action 用レート制限ラッパー
async function checkRateLimitForServerAction(
  key: keyof typeof RATE_LIMIT_CONFIGS,
  clientIP: string
): Promise<{ success: boolean; retryAfter?: number }> {
  // RATE_LIMIT_CONFIGS から対象設定を取得
  const config = RATE_LIMIT_CONFIGS[key] ?? RATE_LIMIT_CONFIGS.default;

  // ダミーの NextRequest を生成してヘッダーに IP を埋め込む
  const request = new NextRequest("http://localhost", {
    headers: {
      "x-forwarded-for": clientIP,
    },
  });

  const result = await checkRateLimit(request, config, key);

  return {
    success: result.success,
    // reset はエポック秒(ms) なので現在時刻との差を算出
    retryAfter: result.success
      ? undefined
      : Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)),
  };
}

/**
 * ログインServer Action
 */
export async function loginAction(formData: FormData): Promise<ServerActionResult<{ user: any }>> {
  let result: ServerActionResult<{ user: any }> = {
    success: false,
    error: "処理中にエラーが発生しました",
  };

  // タイミング攻撃対策でレスポンス時間を正規化
  await TimingAttackProtection.normalizeResponseTime(async () => {
    try {
      // FormDataを解析
      const rawData = formDataToObject(formData);

      // バリデーション
      const validation = loginSchema.safeParse(rawData);
      if (!validation.success) {
        result = {
          success: false,
          fieldErrors: validation.error.flatten().fieldErrors,
          error: "入力データが無効です",
        };
        return;
      }

      const { email, password } = validation.data;

      // セキュリティチェック
      const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
      const sanitizedPassword = InputSanitizer.sanitizePassword(password);

      // レート制限チェック
      const clientIP = getClientIP();
      const rateLimit = await checkRateLimitForServerAction("userLogin", clientIP);

      if (!rateLimit.success) {
        result = {
          success: false,
          error: `ログイン試行回数が上限に達しました。${Math.ceil(rateLimit.retryAfter! / 60)}分後に再試行してください。`,
        };
        return;
      }

      // ログイン処理（セキュリティ機能は LoginService.login 内で処理される）
      const loginResult = await LoginService.login(sanitizedEmail, sanitizedPassword);

      if (!loginResult.success) {
        result = {
          success: false,
          error: "メールアドレスまたはパスワードが正しくありません",
        };
        return;
      }

      // 成功時のレスポンス
      result = {
        success: true,
        data: {
          user: loginResult.user,
        },
        redirectUrl: "/dashboard",
        message: "ログインしました",
      };
    } catch (error) {
      // Error logging in development only
      if (process.env.NODE_ENV === "development") {
        console.error("Login action error:", error);
      }
      result = {
        success: false,
        error: "ログイン処理中にエラーが発生しました",
      };
    }
  }, 300); // 300msに正規化

  return result;
}

/**
 * 登録Server Action
 */
export async function registerAction(
  formData: FormData
): Promise<ServerActionResult<{ user: { id: string; email: string; name?: string } }>> {
  try {
    // FormDataを解析
    const rawData = formDataToObject(formData);

    // バリデーション
    const validation = registerSchema.safeParse(rawData);
    if (!validation.success) {
      return {
        success: false,
        fieldErrors: validation.error.flatten().fieldErrors,
        error: "入力データが無効です",
      };
    }

    const { name, email, password } = validation.data;

    // レート制限チェック
    const clientIP = getClientIP();
    const rateLimit = await checkRateLimitForServerAction("userRegistration", clientIP);

    if (!rateLimit.success) {
      return {
        success: false,
        error: `ユーザー登録試行回数が上限に達しました。${Math.ceil(rateLimit.retryAfter! / 60)}分後に再試行してください。`,
      };
    }

    // 登録処理
    const result = await RegistrationService.register({
      name: name.trim(),
      email: InputSanitizer.sanitizeEmail(email),
      password: InputSanitizer.sanitizePassword(password),
      confirmPassword: InputSanitizer.sanitizePassword(password), // confirmPasswordは既に検証済み
    });

    if (!result.success) {
      if (result.message?.includes("already registered")) {
        return {
          success: false,
          error: "このメールアドレスは既に使用されています",
        };
      }

      return {
        success: false,
        error: result.message || "登録処理中にエラーが発生しました",
      };
    }

    return {
      success: true,
      data: {
        user: { id: result.userId!, email: email, name: name },
      },
      needsEmailConfirmation: true,
      redirectUrl: "/auth/verify-email",
      message: "登録が完了しました。メールアドレスの確認を行ってください。",
    };
  } catch (error) {
    // Error logging in development only
    if (process.env.NODE_ENV === "development") {
      console.error("Register action error:", error);
    }
    return {
      success: false,
      error: "登録処理中にエラーが発生しました",
    };
  }
}

/**
 * ログアウトServer Action
 */
export async function logoutAction(): Promise<ServerActionResult> {
  try {
    // ログアウト処理
    const result = await LogoutService.logout();

    if (!result.success) {
      return {
        success: false,
        error: "ログアウト処理中にエラーが発生しました",
      };
    }

    // セッションキャッシュ無効化（テスト環境では無効化）
    if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
      revalidatePath("/", "layout");
    }

    return {
      success: true,
      redirectUrl: "/auth/login",
      message: result.message,
    };
  } catch (error) {
    // Error logging in development only
    if (process.env.NODE_ENV === "development") {
      console.error("Logout action error:", error);
    }
    return {
      success: false,
      error: "ログアウト処理中にエラーが発生しました",
    };
  }
}

/**
 * パスワードリセットServer Action
 */
export async function resetPasswordAction(formData: FormData): Promise<ServerActionResult> {
  try {
    // FormDataを解析
    const rawData = formDataToObject(formData);

    // バリデーション
    const validation = resetPasswordSchema.safeParse(rawData);
    if (!validation.success) {
      return {
        success: false,
        fieldErrors: validation.error.flatten().fieldErrors,
        error: "入力データが無効です",
      };
    }

    const { email } = validation.data;

    // レート制限チェック（パスワードリセットはdefault設定を使用）
    const clientIP = getClientIP();
    const rateLimit = await checkRateLimitForServerAction("default", clientIP);

    if (!rateLimit.success) {
      return {
        success: false,
        error: `パスワードリセット試行回数が上限に達しました。${Math.ceil(rateLimit.retryAfter! / 60)}分後に再試行してください。`,
      };
    }

    // パスワードリセット処理
    await PasswordResetService.sendResetEmail(InputSanitizer.sanitizeEmail(email));

    // メール列挙攻撃対策：成功・失敗に関わらず同じメッセージを返す
    return {
      success: true,
      message: "パスワードリセットメールを送信しました。メールをご確認ください。",
    };
  } catch (error) {
    // Error logging in development only
    if (process.env.NODE_ENV === "development") {
      console.error("Reset password action error:", error);
    }
    return {
      success: false,
      error: "パスワードリセット処理中にエラーが発生しました",
    };
  }
}
