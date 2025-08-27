import { NextRequest, NextResponse } from "next/server";
import {
  validateInviteToken,
  type EventDetail,
  checkEventCapacity,
} from "@/lib/utils/invite-token";
import { handleRateLimit, type RateLimitErrorResponse } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { logParticipationSecurityEvent } from "@/lib/security/security-logger";
import { createProblemResponse, type ProblemDetails } from "@/lib/api/problem-details";

export interface InviteValidationSuccessResponse {
  success: true;
  data: {
    event: EventDetail;
    isCapacityReached: boolean;
    isRegistrationOpen: boolean;
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
): Promise<NextResponse<InviteValidationSuccessResponse | ProblemDetails | RateLimitErrorResponse>> {
  // レート制限を適用
  const rateLimitResponse = await handleRateLimit(request, RATE_LIMIT_CONFIG.invite, "invite");
  if (rateLimitResponse) {
    return rateLimitResponse as NextResponse<RateLimitErrorResponse>;
  }

  try {
    const { token } = params;

    // トークンパラメータの検証
    if (!token || typeof token !== "string") {
      return createProblemResponse("MISSING_PARAMETER", {
        instance: `/api/invite/${token || "[empty]"}`,
        detail: "招待トークンが必要です",
      });
    }

    // 招待トークンを検証
    const result = await validateInviteToken(token);

    // 無効なトークンの場合（要件1.2）
    if (!result.isValid || !result.event) {
      const problemCode = result.errorCode === "TOKEN_NOT_FOUND"
        ? "INVITE_TOKEN_NOT_FOUND"
        : "INVITE_TOKEN_INVALID";

      return createProblemResponse(problemCode, {
        instance: `/api/invite/${token}`,
        detail: result.errorMessage || "無効な招待リンクです",
      });
    }

    const event = result.event;

    // イベントステータス別のエラーハンドリング
    if (event.status === "cancelled") {
      return createProblemResponse("EVENT_CANCELLED", {
        instance: `/api/invite/${token}`,
      });
    }

    if (event.status === "past") {
      return createProblemResponse("EVENT_ENDED", {
        instance: `/api/invite/${token}`,
      });
    }

    // 登録期限の確認（要件1.4）
    if (event.registration_deadline) {
      const now = new Date();
      const deadline = new Date(event.registration_deadline);
      if (now > deadline) {
        return createProblemResponse("REGISTRATION_DEADLINE_PASSED", {
          instance: `/api/invite/${token}`,
        });
      }
    }

    // 定員状況を詳細に確認（要件1.3）
    const isCapacityReached = await checkEventCapacity(event.id, event.capacity);

    // 定員に達している場合の詳細情報
    if (isCapacityReached && event.capacity) {
      return NextResponse.json({
        success: true,
        data: {
          event,
          isCapacityReached: true,
          isRegistrationOpen: false,
        },
      });
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
    // 開発環境でのデバッグ用ログは削除

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

    return createProblemResponse("INTERNAL_ERROR", {
      instance: `/api/invite/${params.token}`,
      detail: "招待リンクの検証中にエラーが発生しました",
    });
  }
}
