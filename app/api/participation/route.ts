import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerParticipationDirectAction } from "@/app/events/actions/register-participation";
import { participationFormSchema, type ParticipationFormData } from "@/lib/validations/participation";
import { handleRateLimit, type RateLimitErrorResponse } from "@/lib/rate-limit-middleware";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { logParticipationSecurityEvent } from "@/lib/security/security-logger";
import { getClientIP } from "@/lib/utils/ip-detection";

// APIレスポンスの型定義
export interface ParticipationResponse {
  success: boolean;
  data?: {
    attendanceId: string;
    guestToken: string;
    requiresPayment: boolean;
    eventTitle: string;
    participantNickname: string;
    participantEmail: string;
    attendanceStatus: string;
    paymentMethod?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * POST /api/participation - 参加登録フォームの送信を処理
 * 
 * 要件3.1: 参加ステータス選択と記録
 * 要件3.2: 参加者の容量計算への含有
 * 要件3.3: 不参加・未定の記録（容量計算外）
 * 要件4.1: 支払い方法選択の表示と記録
 * 要件5.1: ゲストトークンの生成
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ParticipationResponse | RateLimitErrorResponse>> {
  // レート制限を適用（要件6.1）
  const rateLimitResponse = await handleRateLimit(request, RATE_LIMIT_CONFIG.participation, "participation");
  if (rateLimitResponse) {
    return rateLimitResponse as NextResponse<RateLimitErrorResponse>;
  }

  // リクエスト情報を取得（セキュリティログ用）
  const userAgent = request.headers.get("user-agent") || undefined;
  const ip = getClientIP(request);

  try {
    // リクエストボディの解析
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch (error) {
      // 不正なJSONをセキュリティログに記録
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Invalid JSON in participation request",
        {
          error: error instanceof Error ? error.message : "Unknown JSON parse error",
        },
        { userAgent, ip }
      );

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "リクエストの形式が正しくありません",
          },
        },
        { status: 400 }
      );
    }

    // 入力データの検証
    let participationData: ParticipationFormData;
    try {
      participationData = participationFormSchema.parse(requestBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // バリデーションエラーをセキュリティログに記録
        logParticipationSecurityEvent(
          "VALIDATION_FAILURE",
          "Participation API validation failed",
          {
            errors: error.errors.map(e => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
          { userAgent, ip }
        );

        // 最初のエラーメッセージを返す
        const firstError = error.errors[0];
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: firstError?.message || "入力データが無効です",
              details: { zodErrors: error.errors },
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "入力データが無効です",
          },
        },
        { status: 400 }
      );
    }

    // Server Actionを使用して参加登録を処理
    const result = await registerParticipationDirectAction(participationData);

    // Server Actionの結果に基づいてHTTPレスポンスを作成
    if (!result.success) {
      // エラーコードに基づいてHTTPステータスコードを決定
      let statusCode = 500;
      switch (result.code) {
        case "NOT_FOUND":
          statusCode = 404;
          break;
        case "BUSINESS_RULE_VIOLATION":
          statusCode = 409;
          break;
        case "CONFLICT":
          statusCode = 409;
          break;
        case "VALIDATION_ERROR":
          statusCode = 400;
          break;
        case "DATABASE_ERROR":
          statusCode = 500;
          break;
        default:
          statusCode = 500;
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.code || "INTERNAL_ERROR",
            message: result.error,
            details: result.details,
          },
        },
        { status: statusCode }
      );
    }

    // 成功レスポンスの作成
    const responseData = {
      attendanceId: result.data.attendanceId,
      guestToken: result.data.guestToken,
      requiresPayment: result.data.requiresPayment,
      eventTitle: result.data.eventTitle,
      participantNickname: result.data.participantNickname,
      participantEmail: result.data.participantEmail,
      attendanceStatus: result.data.attendanceStatus,
      paymentMethod: result.data.paymentMethod,
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });

  } catch (error) {
    // 予期しないエラーをセキュリティログに記録
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Unexpected error in participation API",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { userAgent, ip }
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "参加登録の処理中にエラーが発生しました",
        },
      },
      { status: 500 }
    );
  }
}