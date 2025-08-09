"use server";

import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PaymentService, PaymentValidator, PaymentErrorHandler } from "@/lib/services/payment";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  type ErrorCode,
} from "@/lib/types/server-actions";

const inputSchema = z.object({
  paymentId: z.string().uuid(),
  status: z.enum(["received", "waived"]),
  notes: z.string().max(1000).optional(),
});

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

export async function updateCashStatusAction(
  input: unknown
): Promise<ServerActionResult<{ paymentId: string; status: "received" | "waived" }>> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です。", {
        zodErrors: parsed.error.errors,
      });
    }
    const { paymentId, status, notes } = parsed.data;

    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, "認証が必要です。");
    }

    // レート制限（ユーザー単位）
    try {
      const store = await createRateLimitStore();
      const rl = await checkRateLimit(
        store,
        `payment_update_status_${user.id}`,
        RATE_LIMIT_CONFIG.paymentStatusUpdate
      );
      if (!rl.allowed) {
        return createErrorResponse(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "レート制限に達しました。しばらく待ってから再試行してください。",
          rl.retryAfter ? { retryAfter: rl.retryAfter } : undefined
        );
      }
    } catch {
      // レート制限でのストア初期化失敗時はスキップ（安全側）
    }

    // 対象決済の取得（主催者権限チェックは Validator に委譲）
    const { data: paymentWithEvent, error: fetchError } = await supabase
      .from("payments")
      .select(`id, method, status, attendance_id`)
      .eq("id", paymentId)
      .single();

    if (fetchError || !paymentWithEvent) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "決済レコードが見つかりません。");
    }

    // 主催者権限を Validator で検証
    await new PaymentValidator(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    ).validateAttendanceAccess(paymentWithEvent.attendance_id, user.id);

    if (paymentWithEvent.method !== "cash") {
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "現金決済以外は手動更新できません。"
      );
    }

    const validator = new PaymentValidator(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await validator.validateUpdatePaymentStatusParams({ paymentId, status });

    const service = new PaymentService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      new PaymentErrorHandler()
    );
    await service.updatePaymentStatus({
      paymentId,
      status,
      paidAt: status === "received" ? new Date() : undefined,
    });

    // 監査ログ
    const admin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await admin.from("system_logs").insert({
      operation_type: "payment_status_update",
      details: { paymentId, newStatus: status, userId: user.id, notes: notes || null },
    });

    return createSuccessResponse({ paymentId, status });
  } catch (error) {
    if (error instanceof PaymentError) {
      return createErrorResponse(mapPaymentError(error.type), error.message);
    }
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "予期しないエラーが発生しました", {
      originalError: error,
    });
  }
}
