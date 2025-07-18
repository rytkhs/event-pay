import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, createRateLimitStore } from "@/lib/rate-limit/index";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { AccountLockoutService, TimingAttackProtection, InputSanitizer } from "@/lib/auth-security";
import { z } from "zod";
import { formatUtcToJst } from "@/lib/utils/timezone";

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
      // IPアドレス取得
      const ip =
        request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

      const store = await createRateLimitStore();
      const result = await checkRateLimit(store, `login_${ip}`, RATE_LIMIT_CONFIG.login);
      return {
        allowed: result.allowed,
        retryAfter: result.retryAfter,
      };
    } catch {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        // console.error("Rate limit check failed:", _);
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
          `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt ? formatUtcToJst(lockoutStatus.lockoutExpiresAt, "yyyy/MM/dd HH:mm") : ""}に解除されます。`
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
            `ログイン失敗回数が上限に達しました。アカウントが${failureResult.lockoutExpiresAt ? formatUtcToJst(failureResult.lockoutExpiresAt, "yyyy/MM/dd HH:mm") : ""}まで30分間ロックされます。`
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
