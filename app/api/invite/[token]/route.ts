import { NextRequest, NextResponse } from "next/server";
import {
  validateInviteToken,
  type EventDetail,
  checkEventCapacity,
} from "@/lib/utils/invite-token";
import { handleRateLimit, type RateLimitErrorResponse } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { logParticipationSecurityEvent } from "@/lib/security/security-logger";

export interface InviteValidationResponse {
  success: boolean;
  data?: {
    event: EventDetail;
    isCapacityReached: boolean;
    isRegistrationOpen: boolean;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * GET /api/invite/[token] - 招待トークンを検証し、イベントデータを返す
 *
 * 要件1.1: 招待トークンの検証とイベント詳細の表示
 * 要件1.2: 無効・期限切れトークンのエラーハンドリング
 * 要件1.3: 定員到達時の登録防止
 * 要件1.4: 登録期限過ぎの登録防止
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

    // トークンパラメータの検証
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_TOKEN",
            message: "招待トークンが必要です",
          },
        },
        { status: 400 }
      );
    }

    // 招待トークンを検証
    const result = await validateInviteToken(token);

    // 無効なトークンの場合（要件1.2）
    if (!result.isValid || !result.event) {
      const errorCode = result.errorMessage?.includes("見つかりません")
        ? "TOKEN_NOT_FOUND"
        : "INVALID_TOKEN";

      return NextResponse.json(
        {
          success: false,
          error: {
            code: errorCode,
            message: result.errorMessage || "無効な招待リンクです",
          },
        },
        { status: 404 }
      );
    }

    const event = result.event;

    // イベントステータス別のエラーハンドリング
    if (event.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EVENT_CANCELLED",
            message: "このイベントはキャンセルされました",
            details: { eventId: event.id, eventTitle: event.title },
          },
        },
        { status: 410 }
      );
    }

    if (event.status === "past") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EVENT_ENDED",
            message: "このイベントは終了しています",
            details: { eventId: event.id, eventDate: event.date },
          },
        },
        { status: 410 }
      );
    }

    // 登録期限の確認（要件1.4）
    if (event.registration_deadline) {
      const now = new Date();
      const deadline = new Date(event.registration_deadline);
      if (now > deadline) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "REGISTRATION_DEADLINE_PASSED",
              message: "参加申込期限が過ぎています",
              details: {
                deadline: event.registration_deadline,
                currentTime: now.toISOString(),
              },
            },
          },
          { status: 410 }
        );
      }
    }

    // 定員状況を詳細に確認（要件1.3）
    const isCapacityReached = await checkEventCapacity(event.id, event.capacity);

    // 定員に達している場合の詳細情報
    if (isCapacityReached && event.capacity) {
      return NextResponse.json(
        {
          success: true,
          data: {
            event,
            isCapacityReached: true,
            isRegistrationOpen: false,
          },
          error: {
            code: "CAPACITY_REACHED",
            message: "このイベントは定員に達しています",
            details: {
              capacity: event.capacity,
              currentAttendees: event.attendances_count,
            },
          },
        },
        { status: 200 }
      );
    }

    // 正常なレスポンス
    return NextResponse.json({
      success: true,
      data: {
        event,
        isCapacityReached,
        isRegistrationOpen: result.canRegister && !isCapacityReached,
      },
    });
  } catch (error) {
    // エラーログ（本番環境では適切なログシステムを使用）
    if (process.env.NODE_ENV === "development") {
      console.error("Invite API error:", error);
    }

    // セキュリティログに記録
    const userAgent = request.headers.get("user-agent") || undefined;
    const ip =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Unexpected error in invite API",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        token: params.token,
      },
      { userAgent, ip }
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "招待リンクの検証中にエラーが発生しました",
        },
      },
      { status: 500 }
    );
  }
}
