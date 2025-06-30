import { NextRequest } from "next/server";
import { ApiResponseHelper } from "@/lib/api/response";
import { RegistrationService } from "@/lib/services/registration";
import { withCSRFProtection } from "@/lib/middleware/csrf-protection";
import { z } from "zod";

export async function POST(request: NextRequest) {
  return withCSRFProtection(request, async (req) => {
  try {
    // レート制限チェック
    const rateLimitResult = await RegistrationService.checkRateLimit(req);
    if (!rateLimitResult.allowed) {
      const errorMessage = rateLimitResult.retryAfter
        ? `レート制限に達しました。${rateLimitResult.retryAfter}秒後に再試行してください。`
        : "レート制限に達しました。しばらく待ってから再試行してください。";
      return ApiResponseHelper.rateLimit(errorMessage, rateLimitResult.retryAfter);
    }

    // 入力値検証
    const validatedData = await RegistrationService.validateInput(req);

    // ユーザー登録処理
    const result = await RegistrationService.register(validatedData);

    return ApiResponseHelper.success(undefined, result.message);
  } catch (error) {
    // Zodバリデーションエラーの詳細処理
    if (error instanceof z.ZodError) {
      return ApiResponseHelper.validation(error);
    }

    // RegistrationServiceから投げられたエラー
    if (error instanceof Error) {
      return ApiResponseHelper.badRequest(error.message, "SIGNUP_FAILED");
    }

    // eslint-disable-next-line no-console
    console.error("Register API error:", error);
    return ApiResponseHelper.internalError("サーバーエラーが発生しました", "INTERNAL_ERROR");
  }
  });
}
