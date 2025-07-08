import { NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  deleteUserById,
  checkUserProfileExists,
} from "@/lib/supabase/admin";
import { checkRateLimit, createRateLimitStore, type RateLimitResult } from "@/lib/rate-limit/index";
import { RATE_LIMIT_CONFIG } from "@/config/security";
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
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d!@#$%^&*(),.?":{}|<>]*$/,
        "パスワードは大文字・小文字・数字を含む英数字・記号のみ使用できます"
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
    try {
      // IPアドレス取得
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
      
      const store = await createRateLimitStore();
      const result = await checkRateLimit(store, `register_${ip}`, RATE_LIMIT_CONFIG.register);

      return {
        allowed: result.allowed,
        retryAfter: result.retryAfter,
      };
    } catch (error) {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        // console.error("Rate limit check failed:", error);
      }
      // フェイルオープン（エラー時は制限しない）
      return { allowed: true };
    }
  }

  static async validateInput(request: NextRequest): Promise<RegistrationData> {
    const body = await request.json();
    return registrationSchema.parse(body);
  }

  static async register(data: RegistrationData): Promise<RegistrationResult> {
    const adminClient = createSupabaseAdminClient();

    // 標準的なSupabase登録フローを使用（メール確認付き）
    const { data: authData, error: authError } = await adminClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
      },
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

      return {
        success: true,
        userId,
        message: "ユーザー登録が完了しました。メールを確認してください。",
      };
    } catch (error) {
      // 何らかのエラーが発生した場合、auth.usersからも削除
      try {
        await deleteUserById(userId);
      } catch (cleanupError) {
        // 「User not found」エラーの場合はログ出力を抑制（テスト環境では正常なケース）
        const errorMessage = (cleanupError as Error).message;
        if (!errorMessage.includes("User not found")) {
          // 本番環境では適切なログシステムに出力
          if (process.env.NODE_ENV === "development") {
            // console.error("Failed to cleanup user after registration failure:", cleanupError);
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
      } catch {
        // 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          // console.warn("Profile check failed during polling:", _);
        }
      }

      // 次のポーリングまで待機
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
  }
}
