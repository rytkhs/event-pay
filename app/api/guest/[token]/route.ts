import { NextRequest, NextResponse } from "next/server";
import { validateGuestToken, type GuestAttendanceData } from "@/lib/utils/guest-token";
import { handleRateLimit, type RateLimitErrorResponse } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { logger } from "@/lib/logging/app-logger";
import { logInvalidTokenAccess } from "@/lib/security/security-logger";
import { getClientIP } from "@/lib/utils/ip-detection";

export interface GuestValidationResponse {
  success: boolean;
  data?: {
    attendance: GuestAttendanceData;
    canModify: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * GET /api/guest/[token] - ゲストトークンを検証し、参加データを返す
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<NextResponse<GuestValidationResponse | RateLimitErrorResponse>> {
  // レート制限を適用
  const rateLimitResponse = await handleRateLimit(request, RATE_LIMIT_CONFIG.guest, "guest");
  if (rateLimitResponse) {
    return rateLimitResponse as NextResponse<RateLimitErrorResponse>;
  }

  const { token } = params;

  try {
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_TOKEN",
            message: "ゲストトークンが必要です",
          },
        },
        { status: 400 }
      );
    }

    // ゲストトークンを検証
    const result = await validateGuestToken(token);

    if (!result.isValid || !result.attendance) {
      // セキュリティログ（トークンは内部でマスクされる）
      const userAgent = request.headers.get("user-agent") || undefined;
      const ip = getClientIP(request);
      logInvalidTokenAccess(token, "guest", { userAgent, ip });

      const errorCode = (result.errorMessage || "").includes("見つかりません")
        ? "TOKEN_NOT_FOUND"
        : "INVALID_TOKEN";

      return NextResponse.json(
        {
          success: false,
          error: {
            code: errorCode,
            message: result.errorMessage || "無効なゲストトークンです",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        attendance: result.attendance,
        canModify: result.canModify,
      },
    });
  } catch (error) {
    logger.error("Guest validation API error", {
      tag: "guestValidation",
      token: token.substring(0, 8) + "...", // セキュリティのため一部のみ
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "参加データの取得中にエラーが発生しました",
        },
      },
      { status: 500 }
    );
  }
}
