import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  deleteUserById,
  checkUserProfileExists,
} from "@/lib/supabase/admin";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { AccountLockoutService, TimingAttackProtection, InputSanitizer } from "@/lib/auth-security";
import { PASSWORD_CONFIG } from "@/config/security";
import { z } from "zod";

export const registrationSchema = z
  .object({
    name: z.string().min(1, "名前は必須です").max(100, "名前は100文字以内で入力してください"),
    email: z.string().email("有効なメールアドレスを入力してください"),
    password: z
      .string()
      .min(
        PASSWORD_CONFIG.minLength,
        `パスワードは${PASSWORD_CONFIG.minLength}文字以上で入力してください`
      )
      .max(128, "パスワードは128文字以内で入力してください")
      .regex(
        /^(?=.*[A-Za-z\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf])(?=.*\d)/,
        "パスワードは英数字を含む必要があります"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "パスワードと確認用パスワードが一致しません",
    path: ["confirmPassword"],
  });

export type RegistrationData = z.infer<typeof registrationSchema>;

export interface RegistrationRateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface RegistrationResult {
  success: boolean;
  userId?: string;
  message?: string;
}

export class RegistrationService {
  static async checkRateLimit(request: NextRequest): Promise<RegistrationRateLimitResult> {
    const result = await checkRateLimit(request, RATE_LIMIT_CONFIGS.userRegistration, "register");

    return {
      allowed: result.success,
      retryAfter: result.success ? undefined : Math.ceil((result.reset - Date.now()) / 1000),
    };
  }

  static async validateInput(request: NextRequest): Promise<RegistrationData> {
    const body = await request.json();
    return registrationSchema.parse(body);
  }

  static async register(data: RegistrationData): Promise<RegistrationResult> {
    const adminClient = createSupabaseAdminClient();

    // Supabase Authでユーザー作成（Admin権限で実行）
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: data.email,
      password: data.password,
      user_metadata: {
        name: data.name,
      },
      email_confirm: false, // 後でメール確認を送信
    });

    if (authError) {
      throw new Error(authError.message);
    }

    const userId = authData.user?.id;
    if (!userId) {
      throw new Error("User creation failed: No user ID returned");
    }

    try {
      // public.usersテーブルにプロファイルレコードを作成
      const { error: profileError } = await adminClient.from("users").insert({
        id: userId,
        name: data.name,
      });

      if (profileError) {
        throw new Error(`Failed to create user profile: ${profileError.message}`);
      }

      // メール確認送信
      const { error: emailError } = await adminClient.auth.admin.generateLink({
        type: "signup",
        email: data.email,
        password: data.password, // Supabase requirementを満たすため必要
      });

      if (emailError) {
        // 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          console.warn("Email confirmation send failed:", emailError);
        }
        // メール送信失敗は警告に留める（ユーザー登録自体は成功）
      }

      return {
        success: true,
        userId,
        message: "ユーザー登録が完了しました。メールを確認してください。",
      };
    } catch (error) {
      // 何らかのエラーが発生した場合、auth.usersからも削除
      try {
        await deleteUserById(userId);
      } catch (deleteError) {
        // 「User not found」エラーの場合はログ出力を抑制（テスト環境では正常なケース）
        const errorMessage = (deleteError as Error).message;
        if (!errorMessage.includes("User not found")) {
          // 本番環境では適切なログシステムに出力
          if (process.env.NODE_ENV === "development") {
            console.error("Failed to cleanup user after registration failure:", deleteError);
          }
        }
      }
      throw error;
    }
  }

  /**
   * プロファイル作成を指定時間まで待機する
   */
  private static async waitForProfileCreation(userId: string, maxWaitMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 200; // 200ms間隔でポーリング

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const exists = await checkUserProfileExists(userId);
        if (exists) {
          return true;
        }
      } catch (error) {
        // 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          console.warn("Profile check failed during polling:", error);
        }
      }

      // 次のポーリングまで待機
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
  }
}

// ログイン関連の型定義
export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  user: {
    id: string;
    email: string | undefined;
  };
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * ログイン認証サービス
 * EventPay固有のセキュリティ機能を統合したログイン処理
 */
export class LoginService {
  /**
   * 入力値の検証とサニタイゼーション
   * @param request NextRequestオブジェクト
   * @returns 検証済みログイン情報
   */
  static async validateInput(request: NextRequest): Promise<LoginInput> {
    const loginSchema = z.object({
      email: z
        .string()
        .email("有効なメールアドレスを入力してください")
        .max(254, "メールアドレスは254文字以内で入力してください"),
      password: z
        .string()
        .min(1, "パスワードを入力してください")
        .max(128, "パスワードは128文字以内で入力してください"),
    });

    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    // 入力値のサニタイゼーション
    const sanitizedEmail = InputSanitizer.sanitizeEmail(validatedData.email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(validatedData.password);

    return {
      email: sanitizedEmail,
      password: sanitizedPassword,
    };
  }

  /**
   * ログイン試行のレート制限チェック
   * @param request NextRequestオブジェクト
   * @returns レート制限結果
   */
  static async checkRateLimit(request: NextRequest): Promise<RateLimitCheckResult> {
    try {
      const result = await checkRateLimit(request, RATE_LIMIT_CONFIGS.userLogin, "login");
      return {
        allowed: result.success,
        retryAfter: result.success ? undefined : Math.ceil((result.reset - Date.now()) / 1000),
      };
    } catch (error) {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.error("Rate limit check failed:", error);
      }
      // フェイルオープン（エラー時は制限しない）
      return { allowed: true };
    }
  }

  /**
   * セキュリティ機能を統合したログイン処理
   * @param email メールアドレス
   * @param password パスワード
   * @returns ログイン結果
   */
  static async login(email: string, password: string): Promise<LoginResult> {
    // タイミング攻撃対策: 一定時間の処理を保証
    let result: LoginResult = {
      success: false,
      user: { id: "", email: undefined },
    };
    await TimingAttackProtection.normalizeResponseTime(async () => {
      // アカウントロック状態をチェック
      const lockoutStatus = await AccountLockoutService.checkLockoutStatus(email);
      if (lockoutStatus.isLocked) {
        throw new Error(
          `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt?.toLocaleString("ja-JP")}に解除されます。`
        );
      }

      const supabase = createSupabaseServerClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // ログイン失敗を記録
        const failureResult = await AccountLockoutService.recordFailedAttempt(email);

        if (failureResult.isLocked) {
          throw new Error(
            `ログイン失敗回数が上限に達しました。アカウントが${failureResult.lockoutExpiresAt?.toLocaleString("ja-JP")}まで30分間ロックされます。`
          );
        }

        const remainingAttempts = (lockoutStatus.remainingAttempts || 5) - 1;
        if (remainingAttempts > 0) {
          throw new Error(
            `メールアドレスまたはパスワードが間違っています。残り試行回数: ${remainingAttempts}回`
          );
        } else {
          throw new Error("メールアドレスまたはパスワードが間違っています");
        }
      }

      // ログイン成功: 失敗回数とロックをリセット
      await AccountLockoutService.clearFailedAttempts(email);

      result = {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      };
    }, 300); // 300msに正規化

    return result;
  }
}

export class PasswordResetService {
  static async validateInput(request: NextRequest) {
    const resetSchema = z.object({
      email: z.string().email("有効なメールアドレスを入力してください"),
    });

    const body = await request.json();
    return resetSchema.parse(body);
  }

  static async sendResetEmail(email: string) {
    const supabase = createSupabaseServerClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password/confirm`,
    });

    // セキュリティ上、エラーの有無に関わらず同じメッセージを返す
    // メール列挙攻撃（存在しないメールアドレスの判別）を防ぐため
    if (error) {
      // ログには詳細なエラーを記録（監視用）- 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.warn("Password reset email send failed:", {
          email: email.replace(/(.{2}).*(@.*)/, "$1***$2"), // メールアドレスを部分的にマスク
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 成功・失敗に関わらず同じレスポンスを返す
    return {
      success: true,
      message:
        "パスワードリセットメールを送信しました。メールが届かない場合は、迷惑メールフォルダもご確認ください。",
    };
  }
}

export class LogoutService {
  static async logout() {
    const supabase = createSupabaseServerClient();

    // セッション情報を取得してからログアウト
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }

    // セッションキャッシュを無効化
    if (userId) {
      const { AuthHandler } = await import("@/lib/middleware/auth-handler");
      AuthHandler.invalidateSession(userId);
    }

    return {
      success: true,
      message: "ログアウトに成功しました",
    };
  }
}
