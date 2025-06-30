import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

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
