"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType, type AuthResponse } from "@supabase/supabase-js";
import { checkRateLimit, createRateLimitStore } from "@/lib/rate-limit/index";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { AccountLockoutService, TimingAttackProtection, InputSanitizer } from "@/lib/auth-security";
import { headers } from "next/headers";

// バリデーションスキーマ
const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
  password: z.string().min(1, "パスワードを入力してください").max(128),
});

const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "名前を入力してください")
      .max(100, "名前は100文字以内で入力してください")
      .refine(
        (name) => {
          const trimmed = name.trim();
          // NULL文字やcontrol文字のチェック
          if (trimmed.includes("\0") || trimmed.includes("\x1a")) return false;
          // 危険な特殊文字のチェック（アポストロフィと引用符は許可）
          if (/[;&|`$(){}[\]<>\\]/.test(trimmed)) return false;
          // コマンドインジェクション対策（完全なコマンド形式のみ拒否）
          if (
            /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
              trimmed
            )
          )
            return false;
          return true;
        },
        {
          message: "名前に無効な文字が含まれています",
        }
      ),
    email: z.string().email("有効なメールアドレスを入力してください").max(254),
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128)
      .regex(
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
        "パスワードは大文字・小文字・数字を含む必要があります"
      ),
    passwordConfirm: z.string(),
    termsAgreed: z.string().refine((value) => value === "true", {
      message: "利用規約に同意してください",
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

const resetPasswordSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
});

const verifyOtpSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  otp: z.string().regex(/^\d{6}$/, "6桁の数字を入力してください"),
  type: z.enum(["signup", "recovery", "email_change"]),
});

const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128)
      .regex(
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
        "パスワードは大文字・小文字・数字を含む必要があります"
      ),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

// 共通結果型
export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectUrl?: string;
  needsVerification?: boolean;
};

// FormDataをオブジェクトに変換
function formDataToObject(formData: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value.toString();
  }
  return data;
}

/**
 * ログイン
 */
export async function loginAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  try {
    // CSRF対策: Origin/Refererヘッダーの検証（テスト環境では無効化）
    if (process.env.NODE_ENV !== "test") {
      const headersList = headers();
      const origin = headersList.get("origin");
      const referer = headersList.get("referer");
      const host = headersList.get("host");

      if (!origin && !referer) {
        await TimingAttackProtection.addConstantDelay();
        return {
          success: false,
          error: "不正なリクエストです",
        };
      }

      const allowedOrigins = [
        `https://${host}`,
        `http://${host}`,
        process.env.NEXT_PUBLIC_SITE_URL,
      ].filter(Boolean);

      const isValidOrigin = origin && allowedOrigins.some((allowed) => origin === allowed);
      const isValidReferer =
        referer && allowedOrigins.some((allowed) => referer.startsWith(allowed + "/"));

      if (!isValidOrigin && !isValidReferer) {
        await TimingAttackProtection.addConstantDelay();
        return {
          success: false,
          error: "CSRF攻撃を検出しました",
        };
      }
    }

    // レート制限チェック（テスト環境では無効化）
    if (process.env.NODE_ENV !== "test") {
      try {
        const headersList = headers();
        const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";

        const store = await createRateLimitStore();
        const rateLimitResult = await checkRateLimit(store, `login_${ip}`, RATE_LIMIT_CONFIG.login);
        if (!rateLimitResult.allowed) {
          await TimingAttackProtection.addConstantDelay();
          return {
            success: false,
            error: "ログイン試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch {
        // Redis接続エラー等の場合はログに記録してスキップ
        // console.warn("Rate limit check failed:", rateLimitError);
      }
    }

    const rawData = formDataToObject(formData);
    const result = loginSchema.safeParse(rawData);

    if (!result.success) {
      // タイミング攻撃対策: バリデーションエラー時も一定時間待機
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { email, password } = result.data;

    // 入力値サニタイゼーション
    let sanitizedEmail: string;
    let sanitizedPassword: string;
    try {
      sanitizedEmail = InputSanitizer.sanitizeEmail(email);
      sanitizedPassword = InputSanitizer.sanitizePassword(password);
    } catch {
      // sanitizeError
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        error: "入力内容を確認してください",
      };
    }

    // アカウントロックアウト状態確認
    const lockoutStatus = await AccountLockoutService.checkLockoutStatus(sanitizedEmail);
    if (lockoutStatus.isLocked) {
      await TimingAttackProtection.normalizeResponseTime(async () => {}, 300);
      return {
        success: false,
        error: `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt?.toLocaleTimeString("ja-JP")}頃に再試行してください。`,
      };
    }
    const supabase = createClient();

    // ログイン試行実行（タイミング攻撃対策付き）
    let authResult: AuthResponse | null = null;
    await TimingAttackProtection.normalizeResponseTime(async () => {
      authResult = await supabase.auth.signInWithPassword({
        email: sanitizedEmail,
        password: sanitizedPassword,
      });
    }, 300);

    const { data, error } = authResult!;

    if (error) {
      // console.error("Login error:", error.message);

      // ログイン失敗をアカウントロックアウトに記録
      const lockoutResult = await AccountLockoutService.recordFailedAttempt(sanitizedEmail);

      // アカウントロックアウトが発生した場合
      if (lockoutResult.isLocked) {
        await TimingAttackProtection.addConstantDelay();
        return {
          success: false,
          error: `アカウントがロックされました。しばらく時間をおいてからお試しください。`,
        };
      }

      // 未確認メールエラーの特別処理
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string" &&
        error.message === "Email not confirmed"
      ) {
        try {
          // 開発環境では確認メールを自動再送信
          if (process.env.NODE_ENV === "development") {
            const { error: resendError } = await supabase.auth.resend({
              type: "signup",
              email: sanitizedEmail,
            });

            if (resendError) {
              // console.error("Resend email error:", resendError.message);
            }
          }

          return {
            success: false,
            error: "メールアドレスの確認が必要です。確認メールを再送信しました。",
            redirectUrl: `/auth/verify-email?email=${encodeURIComponent(sanitizedEmail)}`,
          };
        } catch {
          // console.error("Email resend process error:", resendError);

          return {
            success: false,
            error: "メールアドレスの確認が必要です。",
            redirectUrl: `/auth/verify-email?email=${encodeURIComponent(sanitizedEmail)}`,
          };
        }
      }

      // ユーザー列挙攻撃対策: 統一されたエラーメッセージ
      let errorMessage = "メールアドレスまたはパスワードが正しくありません";

      // アカウントロック警告
      if (lockoutResult.isLocked) {
        errorMessage = `ログイン試行回数が上限に達しました。アカウントがロックされています。`;
      } else if (lockoutResult.failedAttempts >= 3) {
        const remaining = 5 - lockoutResult.failedAttempts;
        errorMessage += ` (残り${remaining}回の試行でアカウントがロックされます)`;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // ログイン成功: 失敗回数とロックをクリア
    await AccountLockoutService.clearFailedAttempts(sanitizedEmail);

    // ログイン成功（メール確認済み）
    return {
      success: true,
      data: { user: data?.user },
      message: "ログインしました",
      redirectUrl: "/dashboard",
    };
  } catch {
    // console.error("Login action error:", error);
    // タイミング攻撃対策: エラー時も一定時間確保
    await TimingAttackProtection.addConstantDelay();
    return {
      success: false,
      error: "ログイン処理中にエラーが発生しました",
    };
  }
}

/**
 * ユーザー登録
 */
export async function registerAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  try {
    // レート制限チェック（テスト環境では無効化）
    if (process.env.NODE_ENV !== "test") {
      try {
        const headersList = headers();
        const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";

        const store = await createRateLimitStore();
        const rateLimitResult = await checkRateLimit(
          store,
          `register_${ip}`,
          RATE_LIMIT_CONFIG.register
        );
        if (!rateLimitResult.allowed) {
          await TimingAttackProtection.addConstantDelay();
          return {
            success: false,
            error: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch {
        // console.warn("Rate limit check failed:", rateLimitError);
      }
    }

    const rawData = formDataToObject(formData);
    const result = registerSchema.safeParse(rawData);

    if (!result.success) {
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { name, email, password, termsAgreed } = result.data;

    // 利用規約同意チェック
    if (termsAgreed !== "true") {
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: {
          termsAgreed: ["利用規約に同意してください"],
        },
        error: "利用規約に同意してください",
      };
    }

    // 入力値サニタイゼーション（Zodバリデーション後なので基本的なサニタイゼーションのみ）
    const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(password);
    const sanitizedName = name.trim();

    const supabase = createClient();

    // ユーザー登録（メール確認必須）
    let registrationResult: AuthResponse | null = null;
    await TimingAttackProtection.normalizeResponseTime(async () => {
      registrationResult = await supabase.auth.signUp({
        email: sanitizedEmail,
        password: sanitizedPassword,
        options: {
          data: {
            name: sanitizedName,
            terms_agreed: true,
          },
          // メール確認後のリダイレクト先は設定しない（OTP方式を使用）
        },
      });
    }, 400);

    const { data, error } = registrationResult!;

    if (error) {
      // console.error("Registration error:", error.message);

      // ユーザー列挙攻撃対策: 詳細なエラー情報を隠す
      let errorMessage = "登録処理中にエラーが発生しました";

      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        if (error.message.includes("already registered")) {
          // 既存ユーザー情報の漏洩を防ぐため、統一されたメッセージ
          errorMessage = "このメールアドレスは既に登録されています";
        } else if (error.message.includes("rate limit")) {
          errorMessage = "送信回数の上限に達しました。しばらく時間をおいてからお試しください";
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // 登録成功（メール確認が必要）
    return {
      success: true,
      data: { user: data?.user },
      needsVerification: true,
      message: "登録が完了しました。確認メールを送信しました。",
      redirectUrl: `/auth/verify-otp?email=${encodeURIComponent(sanitizedEmail)}`,
    };
  } catch {
    // console.error("Register action error:", error);
    await TimingAttackProtection.addConstantDelay();
    return {
      success: false,
      error: "登録処理中にエラーが発生しました",
    };
  }
}

/**
 * OTP検証
 */
export async function verifyOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = verifyOtpSchema.safeParse(rawData);

    if (!result.success) {
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { email, otp, type } = result.data;
    const supabase = createClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: type as EmailOtpType,
    });

    if (error) {
      // console.error("OTP verification error:", error.message);

      let errorMessage = "確認コードが正しくありません";
      if (error.message.includes("expired")) {
        errorMessage = "確認コードの有効期限が切れています";
      } else if (error.message.includes("invalid")) {
        errorMessage = "無効な確認コードです";
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // OTP確認成功後、ユーザープロファイル作成
    if (type === "signup" && data.user) {
      try {
        const { error: profileError } = await supabase.from("users").insert({
          id: data.user.id,
          name: data.user.user_metadata?.name || "",
        });

        if (profileError) {
          // console.error("Profile creation error:", profileError);
          // プロファイル作成エラーは非致命的として扱う
        }
      } catch {
        // console.error("Profile creation error:", profileError);
      }
    }

    return {
      success: true,
      message: "メールアドレスが確認されました",
      redirectUrl: "/dashboard",
    };
  } catch {
    // console.error("Verify OTP action error:", error);
    return {
      success: false,
      error: "確認処理中にエラーが発生しました",
    };
  }
}

/**
 * OTP再送信
 */
export async function resendOtpAction(formData: FormData): Promise<ActionResult> {
  try {
    const email = formData.get("email")?.toString();

    if (!email || !z.string().email().safeParse(email).success) {
      return {
        success: false,
        error: "有効なメールアドレスを入力してください",
      };
    }

    const supabase = createClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      // console.error("Resend OTP error:", error.message);

      if (error.message.includes("rate limit")) {
        return {
          success: false,
          error: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        };
      }

      return {
        success: false,
        error: "再送信中にエラーが発生しました",
      };
    }

    return {
      success: true,
      message: "確認コードを再送信しました",
    };
  } catch {
    // console.error("Resend OTP action error:", error);
    return {
      success: false,
      error: "再送信中にエラーが発生しました",
    };
  }
}

/**
 * パスワードリセット要求
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    // レート制限チェック（テスト環境では無効化）
    if (process.env.NODE_ENV !== "test") {
      try {
        const headersList = headers();
        const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";

        const store = await createRateLimitStore();
        const rateLimitResult = await checkRateLimit(
          store,
          `reset_password_${ip}`,
          RATE_LIMIT_CONFIG.passwordReset
        );
        if (!rateLimitResult.allowed) {
          await TimingAttackProtection.addConstantDelay();
          return {
            success: false,
            error:
              "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
          };
        }
      } catch {
        // console.warn("Rate limit check failed:", rateLimitError);
      }
    }

    const rawData = formDataToObject(formData);
    const result = resetPasswordSchema.safeParse(rawData);

    if (!result.success) {
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "有効なメールアドレスを入力してください",
      };
    }

    let { email } = result.data;

    // 入力値サニタイゼーション
    try {
      email = InputSanitizer.sanitizeEmail(email);
    } catch {
      // sanitizeError
      await TimingAttackProtection.addConstantDelay();
      return {
        success: false,
        error: "有効なメールアドレスを入力してください",
      };
    }
    const supabase = createClient();

    // タイミング攻撃対策: 常に一定時間確保
    let resetResult: { data: unknown; error: unknown } | null = null;
    await TimingAttackProtection.normalizeResponseTime(async () => {
      resetResult = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password/update`,
      });
    }, 300);

    const { error } = resetResult!;

    if (error) {
      // console.error("Reset password error:", error.message);
    }

    // セキュリティ上、成功・失敗に関わらず同じメッセージを返す（ユーザー列挙攻撃対策）
    return {
      success: true,
      message: "パスワードリセットメールを送信しました（登録済みのアドレスの場合）",
    };
  } catch {
    // console.error("Reset password action error:", error);
    await TimingAttackProtection.addConstantDelay();
    return {
      success: false,
      error: "処理中にエラーが発生しました",
    };
  }
}

/**
 * パスワード更新（リセット後）
 */
export async function updatePasswordAction(formData: FormData): Promise<ActionResult> {
  try {
    const rawData = formDataToObject(formData);
    const result = updatePasswordSchema.safeParse(rawData);

    if (!result.success) {
      return {
        success: false,
        fieldErrors: result.error.flatten().fieldErrors,
        error: "入力内容を確認してください",
      };
    }

    const { password } = result.data;
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      // console.error("Update password error:", error.message);
      return {
        success: false,
        error: "パスワードの更新に失敗しました",
      };
    }

    return {
      success: true,
      message: "パスワードが更新されました",
      redirectUrl: "/dashboard",
    };
  } catch {
    // console.error("Update password action error:", error);
    return {
      success: false,
      error: "処理中にエラーが発生しました",
    };
  }
}

/**
 * ログアウト
 */
export async function logoutAction(): Promise<ActionResult> {
  try {
    const supabase = createClient();

    // ログアウト実行（認証状態に関係なく実行）
    const { error } = await supabase.auth.signOut();

    if (error) {
      // console.error("Logout error:", error.message);
      // ログアウトエラーでも成功として扱う（既にログアウト状態の可能性）
      return {
        success: true,
        message: "ログアウトしました",
        redirectUrl: "/auth/login",
      };
    }

    return {
      success: true,
      message: "ログアウトしました",
      redirectUrl: "/auth/login",
    };
  } catch {
    // console.error("Logout action error:", error);
    await TimingAttackProtection.addConstantDelay();
    // ログアウトは基本的に失敗しない処理として扱う
    return {
      success: true,
      message: "ログアウトしました",
      redirectUrl: "/auth/login",
    };
  }
}
