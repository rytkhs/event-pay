"use server";

import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PaymentService, PaymentValidator, PaymentErrorHandler } from "@/lib/services/payment";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  type ErrorCode,
} from "@/lib/types/server-actions";

const inputSchema = z.object({
  attendanceId: z.string().uuid(),
});

type CreateCashActionData =
  | { noPaymentRequired: true; paymentId: null }
  | { paymentId: string };

function mapPaymentError(type: PaymentErrorType): ErrorCode {
  switch (type) {
    case PaymentErrorType.VALIDATION_ERROR:
      return ERROR_CODES.VALIDATION_ERROR;
    case PaymentErrorType.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case PaymentErrorType.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case PaymentErrorType.INVALID_AMOUNT:
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
    case PaymentErrorType.INVALID_STATUS_TRANSITION:
      return ERROR_CODES.BUSINESS_RULE_VIOLATION;
    case PaymentErrorType.EVENT_NOT_FOUND:
    case PaymentErrorType.ATTENDANCE_NOT_FOUND:
    case PaymentErrorType.PAYMENT_NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
      return ERROR_CODES.CONFLICT;
    case PaymentErrorType.DATABASE_ERROR:
      return ERROR_CODES.DATABASE_ERROR;
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

export async function createCashAction(
  input: unknown
): Promise<ServerActionResult<CreateCashActionData>> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です。", {
        zodErrors: parsed.error.errors,
      });
    }
    const { attendanceId } = parsed.data;

    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, "認証が必要です。");
    }

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
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "参加記録が見つかりません。");
    }

    const event = Array.isArray(attendance.events) ? attendance.events[0] : attendance.events;
    if (!event) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "イベントが見つかりません。");
    }

    // 主催者認可チェック（早期リターン前に必ず検証）
    if (event.created_by !== user.id) {
      return createErrorResponse(ERROR_CODES.FORBIDDEN, "この操作を実行する権限がありません。");
    }

    // 金額整合性（feeのみ信頼）
    if (event.fee == null) {
      return createErrorResponse(ERROR_CODES.BUSINESS_RULE_VIOLATION, "イベントの参加費が不正です。");
    }
    const amount = event.fee;
    if (amount === 0) {
      return createSuccessResponse<CreateCashActionData>({
        noPaymentRequired: true,
        paymentId: null,
      });
    }
    if (amount < 0) {
      return createErrorResponse(ERROR_CODES.BUSINESS_RULE_VIOLATION, "イベントの参加費が不正です。");
    }

    // バリデーション
    const validator = new PaymentValidator(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await validator.validateCreateCashPaymentParams({ attendanceId, amount }, user.id);

    // 作成
    const service = new PaymentService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      new PaymentErrorHandler()
    );
    const result = await service.createCashPayment({ attendanceId, amount });

    // 監査ログ
    const admin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await admin.from("system_logs").insert({
      operation_type: "cash_payment_created",
      details: { attendanceId, amount, paymentId: result.paymentId, userId: user.id },
    });

    return createSuccessResponse<CreateCashActionData>({ paymentId: result.paymentId });
  } catch (error) {
    if (error instanceof PaymentError) {
      return createErrorResponse(mapPaymentError(error.type), error.message);
    }
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "予期しないエラーが発生しました", {
      originalError: error,
    });
  }
}
