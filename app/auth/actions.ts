"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { InputSanitizer, TimingAttackProtection } from "@/lib/auth-security";
// TODO: Server Actionsでのレート制限実装時に追加
// import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { RegistrationService } from "@/lib/services/registration";
import { LoginService } from "@/lib/services/login";
import { PasswordResetService } from "@/lib/services/password-reset";
import { LogoutService } from "@/lib/services/logout";

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

// IPアドレス取得ヘルパー（現在未使用だが将来の実装のために保持）
// function getClientIP(): string {
//   // Server Actionsでは直接リクエストオブジェクトにアクセスできないため、
//   // ヘッダーからIPを取得する処理をスキップし、デフォルト値を使用
//   return "127.0.0.1";
// }

/**
 * ログインServer Action
 */
export async function loginAction(formData: FormData): Promise<ServerActionResult> {
  let result: ServerActionResult = { success: false, error: "処理中にエラーが発生しました" };

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

      // TODO: Server Actionsでのレート制限実装
      // 現在は一時的にスキップ（Server ActionsではRequestオブジェクトに直接アクセスできないため）
      // 将来的にはheaders()やcookies()を使用して実装予定

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
export async function registerAction(formData: FormData): Promise<ServerActionResult> {
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

    // TODO: Server Actionsでのレート制限実装
    // 現在は一時的にスキップ（Server ActionsではRequestオブジェクトに直接アクセスできないため）
    // 将来的にはheaders()やcookies()を使用して実装予定

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
        user: { id: result.userId!, email: email },
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

    // TODO: Server Actionsでのレート制限実装
    // 現在は一時的にスキップ（Server ActionsではRequestオブジェクトに直接アクセスできないため）
    // 将来的にはheaders()やcookies()を使用して実装予定

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
