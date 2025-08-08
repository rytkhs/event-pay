import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { handleRateLimit } from "@/lib/rate-limit-middleware";
import {
  PaymentService,
  PaymentValidator,
  PaymentError,
  PaymentErrorType,
} from "@/lib/services/payment";

const createCashPaymentRequestSchema = z.object({
  attendanceId: z.string().uuid(),
  amount: z.number().int().positive(),
});

/**
 * POST /api/payments/create-cash
 * 現金決済レコードの作成（主催者用）
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await handleRateLimit(
      request,
      { windowMs: 60 * 1000, maxAttempts: 10, blockDurationMs: 60 * 1000 },
      "payments:create-cash"
    );
    if (rateLimited) return rateLimited;

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "認証が必要です。" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = createCashPaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "入力データが無効です。",
            details: parsed.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const { attendanceId, amount } = parsed.data;

    // 参加記録の存在確認と主催者権限チェック
    const { data: attendance, error: attendanceError } = await supabase
      .from("attendances")
      .select(
        `
        id,
        event_id,
        events!inner (
          id,
          fee,
          created_by
        )
      `
      )
      .eq("id", attendanceId)
      .single();

    if (attendanceError || !attendance) {
      return NextResponse.json(
        { success: false, error: { code: "ATTENDANCE_NOT_FOUND", message: "参加記録が見つかりません。" } },
        { status: 404 }
      );
    }

    const event = Array.isArray(attendance.events) ? attendance.events[0] : attendance.events;
    if (!event) {
      return NextResponse.json(
        { success: false, error: { code: "EVENT_NOT_FOUND", message: "イベントが見つかりません。" } },
        { status: 404 }
      );
    }

    if (event.created_by !== user.id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "この操作を実行する権限がありません。" } },
        { status: 403 }
      );
    }

    // 金額整合性（要件1.2/1.3に合わせ、0円は作成しない）
    if (amount !== event.fee) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AMOUNT_MISMATCH", message: "指定された金額がイベントの参加費と一致しません。" },
        },
        { status: 400 }
      );
    }
    if (amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NO_PAYMENT_REQUIRED", message: "0円のため決済レコードは作成しません。" },
        },
        { status: 200 }
      );
    }

    // バリデーション
    const validator = new PaymentValidator(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await validator.validateCreateCashPaymentParams({ attendanceId, amount });

    // 作成
    const service = new PaymentService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { handlePaymentError: async () => ({ userMessage: "", shouldRetry: false, logLevel: "info" }) } as any
    );
    const result = await service.createCashPayment({ attendanceId, amount });

    // 監査ログ
    await supabase.from("system_logs").insert({
      operation_type: "cash_payment_created",
      details: { attendanceId, amount, paymentId: result.paymentId, userId: user.id },
    });

    return NextResponse.json({ success: true, data: { paymentId: result.paymentId } });
  } catch (error) {
    if (error instanceof PaymentError) {
      const statusCode = getStatusCodeFromErrorType(error.type);
      return NextResponse.json(
        { success: false, error: { code: error.type, message: error.message } },
        { status: statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "内部サーバーエラーが発生しました。" } },
      { status: 500 }
    );
  }
}

function getStatusCodeFromErrorType(errorType: PaymentErrorType): number {
  switch (errorType) {
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
      return 400;
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
      return 409;
    case PaymentErrorType.EVENT_NOT_FOUND:
    case PaymentErrorType.ATTENDANCE_NOT_FOUND:
      return 404;
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.DATABASE_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
      return 500;
    default:
      return 500;
  }
}
