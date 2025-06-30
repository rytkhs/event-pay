import { NextRequest } from "next/server";
import { ApiResponseHelper } from "@/lib/api/response";
import { PasswordResetService } from "@/lib/services/registration";
import { withCSRFProtection } from "@/lib/middleware/csrf-protection";
import { z } from "zod";

export async function POST(request: NextRequest) {
  return withCSRFProtection(request, async (req) => {
  try {
    // 入力値検証
    const validatedData = await PasswordResetService.validateInput(request);

    // パスワードリセットメール送信
    const result = await PasswordResetService.sendResetEmail(validatedData.email);

    return ApiResponseHelper.success(undefined, result.message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ApiResponseHelper.validation(error);
    }

    if (error instanceof Error) {
      return ApiResponseHelper.badRequest(error.message, "RESET_FAILED");
    }

    return ApiResponseHelper.badRequest("Invalid input data", "VALIDATION_ERROR");
  }
  });
}
