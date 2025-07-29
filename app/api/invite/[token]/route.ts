import { NextRequest, NextResponse } from "next/server";
import { validateInviteToken, type EventDetail } from "@/lib/utils/invite-token";
import { handleRateLimit, type RateLimitErrorResponse } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";

export interface InviteValidationResponse {
  success: boolean;
  data?: {
    event: EventDetail;
    isCapacityReached: boolean;
    isRegistrationOpen: boolean;
  };
  error?: string;
}

/**
 * GET /api/invite/[token] - 招待トークンを検証し、イベントデータを返す
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<NextResponse<InviteValidationResponse | RateLimitErrorResponse>> {
  // レート制限を適用
  const rateLimitResponse = await handleRateLimit(request, RATE_LIMIT_CONFIG.invite, "invite");
  if (rateLimitResponse) {
    return rateLimitResponse as NextResponse<RateLimitErrorResponse>;
  }

  try {
    const { token } = params;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "招待トークンが必要です",
        },
        { status: 400 }
      );
    }

    // 招待トークンを検証
    const result = await validateInviteToken(token);

    if (!result.isValid || !result.event) {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage || "無効な招待リンクです",
        },
        { status: 404 }
      );
    }

    // 定員状況を確認
    const isCapacityReached = result.event.capacity
      ? result.event.attendances_count >= result.event.capacity
      : false;

    return NextResponse.json({
      success: true,
      data: {
        event: result.event,
        isCapacityReached,
        isRegistrationOpen: result.canRegister,
      },
    });
  } catch (error) {
    console.error("招待検証APIエラー:", error);
    return NextResponse.json(
      {
        success: false,
        error: "招待リンクの検証中にエラーが発生しました",
      },
      { status: 500 }
    );
  }
}
