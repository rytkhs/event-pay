import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PaymentService, PaymentErrorHandler } from "@/lib/services/payment";
import { createStripeSessionRequestSchema } from "@/lib/services/payment/validation";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";
import { handleRateLimit } from "@/lib/rate-limit-middleware";

/**
 * POST /api/payments/create-session
 * Stripe決済セッションを作成する
 */
export async function POST(request: NextRequest) {
  try {
    // レート制限チェック
    const rateLimitResponse = await handleRateLimit(
      request,
      {
        windowMs: 60 * 1000, // 1分
        maxAttempts: 3,
        blockDurationMs: 5 * 60 * 1000, // 5分
      },
      "create_session"
    );

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 認証チェック
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "認証が必要です。",
          },
        },
        { status: 401 }
      );
    }

    // リクエストボディの解析
    const body = await request.json();

    // バリデーション
    const validationResult = createStripeSessionRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "入力データが無効です。",
            details: validationResult.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const params = validationResult.data;

    // 参加記録の存在確認と権限チェック
    const { data: attendance, error: attendanceError } = await supabase
      .from("attendances")
      .select(
        `
        id,
        event_id,
        nickname,
        email,
        events!inner (
          id,
          title,
          fee,
          created_by
        )
      `
      )
      .eq("id", params.attendanceId)
      .single();

    if (attendanceError || !attendance) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ATTENDANCE_NOT_FOUND",
            message: "参加記録が見つかりません。",
          },
        },
        { status: 404 }
      );
    }

    // eventsは配列として返されるので、最初の要素を取得
    const event = Array.isArray(attendance.events) ? attendance.events[0] : attendance.events;

    if (!event) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "EVENT_NOT_FOUND",
            message: "イベントが見つかりません。",
          },
        },
        { status: 404 }
      );
    }

    // 主催者のみアクセス可能（ゲストアクセスは別途実装）
    if (event.created_by !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "この操作を実行する権限がありません。",
          },
        },
        { status: 403 }
      );
    }

    // 金額の整合性チェック
    if (params.amount !== event.fee) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AMOUNT_MISMATCH",
            message: "指定された金額がイベントの参加費と一致しません。",
          },
        },
        { status: 400 }
      );
    }

    // 既存の決済レコードチェック
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id, status")
      .eq("attendance_id", params.attendanceId)
      .single();

    if (existingPayment) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PAYMENT_ALREADY_EXISTS",
            message: "この参加に対する決済は既に作成されています。",
          },
        },
        { status: 409 }
      );
    }

    // PaymentServiceを初期化
    const errorHandler = new PaymentErrorHandler();
    const paymentService = new PaymentService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      errorHandler
    );

    // Stripe決済セッションを作成
    const result = await paymentService.createStripeSession({
      attendanceId: params.attendanceId,
      amount: params.amount,
      eventTitle: event.title,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionUrl: result.sessionUrl,
        sessionId: result.sessionId,
      },
    });
  } catch (error) {
    // PaymentErrorの場合は適切なレスポンスを返す
    if (error instanceof PaymentError) {
      const statusCode = getStatusCodeFromErrorType(error.type);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.type,
            message: error.message,
          },
        },
        { status: statusCode }
      );
    }

    // その他のエラー
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "内部サーバーエラーが発生しました。",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PaymentErrorTypeからHTTPステータスコードを取得
 */
function getStatusCodeFromErrorType(errorType: PaymentErrorType): number {
  switch (errorType) {
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
      return 400;
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
      return 409;
    case PaymentErrorType.EVENT_NOT_FOUND:
      return 404;
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.DATABASE_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
      return 500;
    default:
      return 500;
  }
}
