"use server";

import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomDelay } from "@/lib/security/crypto";

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
    const headersList = headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "127.0.0.1";

    const supabase = createClient();

    const { error } = await supabase.auth.verifyOtp({
      email: validatedData.email,
      token: validatedData.otp,
      type: validatedData.type,
    });

    if (error) {
      // セキュリティログ（失敗）- 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        console.warn("OTP verification failed:", {
          email: validatedData.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
          ip,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      // タイミング攻撃防止のための遅延
      await randomDelay(300, 700);

      // エラーメッセージの適切な変換
      let errorMessage = "コードが正しくありません";

      if (error.message.includes("expired")) {
        errorMessage = "確認コードの有効期限が切れています。新しいコードを取得してください。";
      } else if (error.message.includes("invalid")) {
        errorMessage = "無効な確認コードです。正しいコードを入力してください。";
      } else if (error.message.includes("too many attempts")) {
        errorMessage = "試行回数が上限に達しました。新しいコードを取得してください。";
      }

      return { error: errorMessage };
    }

    // セキュリティログ（成功）- 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.info("OTP verification successful:", {
        email: validatedData.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
        ip,
        timestamp: new Date().toISOString(),
      });
    }

    // 成功時はダッシュボードにリダイレクト
    redirect("/dashboard?status=email_confirmed");
  } catch (error) {
    if (error instanceof z.ZodError) {
      await randomDelay(300, 700);
      return { error: error.errors[0]?.message || "入力値が正しくありません" };
    }

    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.error("OTP verification error:", error);
    }
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

    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.error("OTP resend error:", error);
    }
    return { error: "再送信に失敗しました。" };
  }
}
