"use server";

import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";
import { randomDelay } from "@/lib/security/crypto";
import { logger } from "@/lib/logging/app-logger";

// バリデーションスキーマ
const verifyOtpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "6桁の数字を入力してください"),
  email: z.string().email("有効なメールアドレスを入力してください"),
  type: z.enum(["signup", "recovery", "email_change"]),
});

const resendOtpSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
});

export async function verifyOtpAction(payload: { otp: string; email: string; type: EmailOtpType }) {
  try {
    // 入力値検証
    const validatedData = verifyOtpSchema.parse(payload);

    // IPアドレス取得（セキュリティログ用）
    // const headersList = headers();
    // headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    //   headersList.get("x-real-ip") ||
    //   "127.0.0.1";

    const supabase = createClient();

    const { error } = await supabase.auth.verifyOtp({
      email: validatedData.email,
      token: validatedData.otp,
      type: validatedData.type,
    });

    if (error) {
      // セキュリティログ（失敗）
      logger.warn("OTP verification failed", {
        tag: "otpVerificationFailed",
        sanitized_email: validatedData.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
        error_message: error.message,
        error_code: error.message.includes("expired") ? "OTP_EXPIRED" : "INVALID_OTP"
      });

      // タイミング攻撃防止のための遅延
      await randomDelay(300, 700);

      // エラーコードに基づく適切なエラーメッセージの取得
      let errorMessage = "コードが正しくありません";
      let errorCode = "INVALID_OTP";

      // Supabaseエラーコードに基づく分類
      if (error.message.includes("expired") || error.message.includes("Token has expired")) {
        errorMessage = "確認コードの有効期限が切れています。新しいコードを取得してください。";
        errorCode = "OTP_EXPIRED";
      } else if (error.message.includes("invalid")) {
        errorMessage = "無効な確認コードです。正しいコードを入力してください。";
        errorCode = "INVALID_OTP";
      } else if (error.message.includes("too many attempts")) {
        errorMessage = "試行回数が上限に達しました。新しいコードを取得してください。";
        errorCode = "RATE_LIMIT_EXCEEDED";
      } else if (error.message.includes("Email not confirmed")) {
        errorMessage = "メールアドレスが確認されていません。登録からやり直してください。";
        errorCode = "EMAIL_NOT_CONFIRMED";
      } else {
        // 開発環境では詳細なエラーメッセージを表示
        if (process.env.NODE_ENV === "development") {
          errorMessage = `認証エラー [${errorCode}]: ${error.message}`;
        }
      }

      // TODO: 将来的にはSupabaseからエラーコードを直接取得するようにリファクタリング
      // 現在は文字列解析で対応、将来的にはSupabase側でエラーコードを統一

      return { error: errorMessage };
    }

    // セキュリティログ（成功）
    logger.info("OTP verification successful", {
      tag: "otpVerificationSuccess",
      sanitized_email: validatedData.email.replace(/(.{2}).*(@.*)/, "$1***$2")
    });

    // 成功レスポンスを返す（リダイレクトはクライアント側で処理）
    return {
      success: true,
      message: "メールアドレスが確認されました。",
      redirectUrl: "/home?status=email_confirmed",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      await randomDelay(300, 700);
      return { error: error.errors[0]?.message || "入力値が正しくありません" };
    }

    logger.error("OTP verification error", {
      tag: "otpVerificationError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error)
    });
    await randomDelay(300, 700);
    return { error: "認証に失敗しました。再度お試しください。" };
  }
}

export async function resendOtpAction(payload: { email: string }) {
  try {
    // 入力値検証
    const validatedData = resendOtpSchema.parse(payload);

    const supabase = createClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: validatedData.email,
    });

    if (error) {
      // エラーメッセージの適切な変換
      let errorMessage = "再送信に失敗しました";

      if (error.message.includes("rate limit")) {
        errorMessage = "送信回数の上限に達しました。しばらく時間をおいてからお試しください。";
      } else if (error.message.includes("not found")) {
        errorMessage = "ユーザーが見つかりません。";
      }

      return { error: errorMessage };
    }

    return { success: true, message: "確認コードを再送信しました" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.errors[0]?.message || "入力値が正しくありません" };
    }

    logger.error("OTP resend error", {
      tag: "otpResendError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error)
    });
    return { error: "再送信に失敗しました。" };
  }
}
