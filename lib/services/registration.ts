import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  deleteUserById,
  checkUserProfileExists,
} from "@/lib/supabase/admin";
import { getClientIP } from "@/lib/utils/network";
import { createRateLimitStore, checkRateLimit as checkRateLimitV2 } from "@/lib/rate-limit";
import { RATE_LIMIT_CONFIG, PASSWORD_CONFIG } from "@/config/security";
import { z } from "zod";

const rateLimitStore = createRateLimitStore();

export const registrationSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z
    .string()
    .min(
      PASSWORD_CONFIG.minLength,
      `パスワードは${PASSWORD_CONFIG.minLength}文字以上で入力してください`
    )
    .regex(PASSWORD_CONFIG.patterns.uppercase, "大文字を含む必要があります")
    .regex(PASSWORD_CONFIG.patterns.lowercase, "小文字を含む必要があります")
    .regex(PASSWORD_CONFIG.patterns.numbers, "数字を含む必要があります"),
  name: z.string().min(1, "名前を入力してください").max(50, "名前は50文字以内で入力してください"),
});

export type RegistrationData = z.infer<typeof registrationSchema>;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface RegistrationResult {
  success: boolean;
  userId?: string;
  message?: string;
}

export class RegistrationService {
  static async checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
    const clientIP = getClientIP(request);
    const key = `register:${clientIP}`;

    return await checkRateLimitV2(rateLimitStore, key, RATE_LIMIT_CONFIG.register);
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
      // public.usersテーブルへの同期を検証（最大2秒間ポーリング）
      const profileExists = await this.waitForProfileCreation(userId, 2000);

      if (!profileExists) {
        // 補償トランザクション: auth.usersからユーザーを削除
        await deleteUserById(userId);
        throw new Error("ユーザープロファイルの作成に失敗しました。再度お試しください。");
      }

      // メール確認送信
      const { error: emailError } = await adminClient.auth.admin.generateLink({
        type: "signup",
        email: data.email,
        password: data.password, // Supabase requirementを満たすため必要
      });

      if (emailError) {
        // eslint-disable-next-line no-console
        console.warn("Email confirmation send failed:", emailError);
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
        if (!errorMessage.includes('User not found')) {
          // eslint-disable-next-line no-console
          console.error("Failed to cleanup user after registration failure:", deleteError);
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
        // eslint-disable-next-line no-console
        console.warn("Profile check failed during polling:", error);
      }

      // 次のポーリングまで待機
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
  }
}

export class LoginService {
  static async validateInput(request: NextRequest) {
    const loginSchema = z.object({
      email: z.string().email("有効なメールアドレスを入力してください"),
      password: z.string().min(1, "パスワードを入力してください"),
    });

    const body = await request.json();
    return loginSchema.parse(body);
  }

  static async login(email: string, password: string) {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error("メールアドレスまたはパスワードが間違っています");
    }

    return {
      success: true,
      user: {
        id: data.user.id,
      },
    };
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
      // ログには詳細なエラーを記録（監視用）
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
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
