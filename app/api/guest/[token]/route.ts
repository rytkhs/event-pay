import { NextRequest, NextResponse } from "next/server";
import { validateGuestToken, type GuestAttendanceData } from "@/lib/utils/guest-token";
import { handleRateLimit } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { logInvalidTokenAccess } from "@/lib/security/security-logger";
import { getClientIP } from "@/lib/utils/ip-detection";
import { createProblemResponse, type ProblemDetails } from "@/lib/api/problem-details";

export interface GuestValidationSuccessResponse {
  success: true;
  data: {
    attendance: GuestAttendanceData;
    canModify: boolean;
  };
}

/**
 * GET /api/guest/[token] - ゲストトークンを検証し、参加データを返す
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<NextResponse<GuestValidationSuccessResponse | ProblemDetails>> {
  // レート制限を適用
  const rateLimitResponse = await handleRateLimit(request, RATE_LIMIT_CONFIG.guest, "guest");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { token } = params;

  try {
    if (!token) {
      return createProblemResponse("MISSING_PARAMETER", {
        instance: `/api/guest/${token || "[empty]"}`,
        detail: "ゲストトークンが必要です",
      });
    }

    // ゲストトークンを検証
    const result = await validateGuestToken(token);

    if (!result.isValid || !result.attendance) {
      const userAgent = request.headers.get("user-agent") || undefined;
      const ip = getClientIP(request);
      logInvalidTokenAccess(token, "guest", { userAgent, ip });

      const problemCode = result.errorCode === "TOKEN_NOT_FOUND"
        ? "GUEST_TOKEN_NOT_FOUND"
        : "GUEST_TOKEN_INVALID";

      return createProblemResponse(problemCode, {
        instance: `/api/guest/${token}`,
        detail: result.errorMessage || "無効なゲストトークンです",
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        attendance: result.attendance,
        canModify: result.canModify,
      },
    });
  } catch (error) {
    const { getErrorDetails, logError } = await import("@/lib/utils/error-handler");

    const errorContext = {
      action: "guest_token_validation",
      ip: getClientIP(request),
      userAgent: request.headers.get("user-agent") || undefined,
      additionalData: {
        tokenPrefix: token.substring(0, 8) + "...",
        originalError: error instanceof Error ? error.name : "Unknown",
        originalMessage: error instanceof Error ? error.message : String(error)
      }
    };

    logError(getErrorDetails("GUEST_TOKEN_VALIDATION_FAILED"), errorContext);

    return createProblemResponse("INTERNAL_ERROR", {
      instance: `/api/guest/${token}`,
      detail: "参加データの取得中にエラーが発生しました",
      log_context: { guest_token_error: true }
    });
  }
}
