import { NextRequest } from "next/server";
import { ApiResponseHelper } from "@/lib/api/response";
import { LoginService } from "@/lib/services/registration";
import { getClientIP } from "@/lib/auth-security";
import { z } from "zod";

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    // レート制限チェック
    const rateLimitResult = await LoginService.checkRateLimit(request);
    if (!rateLimitResult.allowed) {
      return ApiResponseHelper.rateLimit(
        "ログイン試行回数が上限に達しました。しばらく時間をおいてから再試行してください。",
        rateLimitResult.retryAfter
      );
    }

    // 入力値検証
    const validatedData = await LoginService.validateInput(request);

    // ログイン処理
    const result = await LoginService.login(validatedData.email, validatedData.password);

    // セキュリティログ（成功）- 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.log("Login successful:", {
        email: validatedData.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
        ip: clientIP,
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
    }

    return ApiResponseHelper.success({ user: result.user }, "ログインに成功しました");
  } catch (error) {
    // セキュリティログ（失敗）- 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.warn("Login failed:", {
        ip: clientIP,
        userAgent: request.headers.get("user-agent"),
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }

    if (error instanceof z.ZodError) {
      return ApiResponseHelper.validation(error);
    }

    if (error instanceof Error) {
      // アカウントロックの場合は423を返す
      if (
        error.message.includes("アカウントがロック") ||
        error.message.includes("ログイン失敗回数が上限")
      ) {
        return ApiResponseHelper.error(error.message, "ACCOUNT_LOCKED", 423);
      }

      return ApiResponseHelper.unauthorized(error.message, "LOGIN_FAILED");
    }

    return ApiResponseHelper.badRequest("Invalid input data", "VALIDATION_ERROR");
  }
}
