import { NextRequest, NextResponse } from "next/server";
import { validateGuestToken, type GuestAttendanceData } from "@/lib/utils/guest-token";
import { handleRateLimit, type RateLimitErrorResponse } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";

export interface GuestValidationResponse {
  success: boolean;
  data?: {
    attendance: GuestAttendanceData;
    canModify: boolean;
  };
  error?: string;
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

  try {
    const { token } = params;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "ゲストトークンが必要です",
        },
        { status: 400 }
      );
    }

    // ゲストトークンを検証
    const result = await validateGuestToken(token);

    if (!result.isValid || !result.attendance) {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage || "無効なゲストトークンです",
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
    console.error("ゲスト検証APIエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "参加データの取得中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}