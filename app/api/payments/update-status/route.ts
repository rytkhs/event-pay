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

// 入力スキーマ（現金決済の手動更新用）
const updateCashStatusRequestSchema = z.object({
  paymentId: z.string().uuid(),
  status: z.enum(["received", "waived"]),
  notes: z.string().max(1000).optional(),
});

/**
 * POST /api/payments/update-status
 * 主催者が現金決済ステータス（received | waived）を手動更新する
 */
export async function POST(request: NextRequest) {
  try {
    // レート制限: 1分に10回まで
    const rateLimited = await handleRateLimit(
      request,
      { windowMs: 60 * 1000, maxAttempts: 10, blockDurationMs: 60 * 1000 },
      "payments:update-status"
    );
    if (rateLimited) return rateLimited;

    // 認証
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

    // 入力取得・検証
    const body = await request.json();
    const parsed = updateCashStatusRequestSchema.safeParse(body);
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
    const { paymentId, status, notes } = parsed.data;

    // 対象決済の取得 + 権限確認（主催者のみ）
    const { data: paymentWithEvent, error: fetchError } = await supabase
      .from("payments")
      .select(
        `
        id,
        method,
        status,
        attendance_id,
        attendances!inner (
          id,
          events!inner (
            id,
            created_by
          )
        )
      `
      )
      .eq("id", paymentId)
      .single();

    if (fetchError || !paymentWithEvent) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PAYMENT_NOT_FOUND", message: "決済レコードが見つかりません。" },
        },
        { status: 404 }
      );
    }

    // 主催者チェック
    // attendances / events の戻り形は配列の場合があるため両対応
    let eventCreatedBy: string | undefined;
    const attendancesRel: any = (paymentWithEvent as any).attendances;
    if (Array.isArray(attendancesRel)) {
      const firstAttendance = attendancesRel[0];
      const eventsRel = firstAttendance?.events as any;
      if (Array.isArray(eventsRel)) {
        eventCreatedBy = eventsRel[0]?.created_by;
      } else {
        eventCreatedBy = eventsRel?.created_by;
      }
    } else if (attendancesRel) {
      const eventsRel = (attendancesRel as any).events as any;
      if (Array.isArray(eventsRel)) {
        eventCreatedBy = eventsRel[0]?.created_by;
      } else {
        eventCreatedBy = eventsRel?.created_by;
      }
    }

    if (!eventCreatedBy || eventCreatedBy !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "この操作を実行する権限がありません。" },
        },
        { status: 403 }
      );
    }

    // 現金決済のみ許可
    if (paymentWithEvent.method !== "cash") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_OPERATION", message: "現金決済以外は手動更新できません。" },
        },
        { status: 400 }
      );
    }

    // バリデーション（遷移妥当性検証含む）
    const validator = new PaymentValidator(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await validator.validateUpdatePaymentStatusParams({ paymentId, status });

    // ステータス更新
    const paymentService = new PaymentService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      // ルートではエラーハンドラは使用しない（必要時に拡張）
      { handlePaymentError: async () => ({ userMessage: "", shouldRetry: false, logLevel: "info" }) } as any
    );

    await paymentService.updatePaymentStatus({
      paymentId,
      status,
      paidAt: status === "received" ? new Date() : undefined,
    });

    // 更新履歴の記録（system_logs）
    await supabase.from("system_logs").insert({
      operation_type: "payment_status_update",
      details: {
        paymentId,
        newStatus: status,
        userId: user.id,
        notes: notes || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentId,
        status,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      const statusCode = getStatusCodeFromErrorType(error.type);
      return NextResponse.json(
        {
          success: false,
          error: { code: error.type, message: error.message },
        },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "内部サーバーエラーが発生しました。" },
      },
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
