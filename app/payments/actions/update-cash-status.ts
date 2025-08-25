"use server";

import { z } from "zod";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { PaymentValidator } from "@/lib/services/payment";
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
    case PaymentErrorType.CONCURRENT_UPDATE:
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

    const factory = SecureSupabaseClientFactory.getInstance();
    const supabase = await factory.createAuthenticatedClient();
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

    // 基本的な権限チェック（RPC関数内でも再チェックされる）
    await new PaymentValidator(supabase).validateAttendanceAccess(
      paymentWithEvent.attendance_id,
      user.id
    );

    if (paymentWithEvent.method !== "cash") {
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "現金決済以外は手動更新できません。"
      );
    }

    // 現在のバージョンを取得（権限チェックも兼ねる）
    const { data: currentPayment, error: fetchPaymentError } = await supabase
      .from("payments")
      .select(`
        version,
        method,
        attendances!inner (
          id,
          events!inner (
            id,
            created_by
          )
        )
      `)
      .eq("id", paymentId)
      .single();

    if (fetchPaymentError || !currentPayment) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "決済レコードが見つかりません。");
    }

    // 権限チェック：主催者のみ
    const attendance = Array.isArray(currentPayment.attendances)
      ? currentPayment.attendances[0]
      : currentPayment.attendances;
    const event = Array.isArray(attendance.events)
      ? attendance.events[0]
      : attendance.events;

    if (event.created_by !== user.id) {
      return createErrorResponse(ERROR_CODES.FORBIDDEN, "この操作を実行する権限がありません。");
    }

    // 現金決済のみ
    if (currentPayment.method !== "cash") {
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "現金決済以外は手動更新できません。"
      );
    }

    // ステータス遷移などのビジネスルール検証
    try {
      await new PaymentValidator(supabase).validateUpdatePaymentStatusParams({
        paymentId,
        status,
      });
    } catch (validationError) {
      if (validationError instanceof PaymentError) {
        return createErrorResponse(mapPaymentError(validationError.type), validationError.message);
      }
      return createErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        "ステータス検証中に予期しないエラーが発生しました。"
      );
    }

    // 楽観的ロック付きRPCで更新
    const admin = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "app/payments/actions/update-cash-status"
    );

    const { data: _rpcResult, error: rpcError } = await admin.rpc('rpc_update_payment_status_safe', {
      p_payment_id: paymentId,
      p_new_status: status,
      p_expected_version: currentPayment.version,
      p_user_id: user.id,
      p_notes: notes || null,
    });

    if (rpcError) {
      // 楽観的ロック競合の場合
      if (rpcError.code === '40001') {
        return createErrorResponse(
          ERROR_CODES.CONFLICT,
          "他のユーザーによって同時に更新されました。最新の状態を確認してから再試行してください。"
        );
      }

      return createErrorResponse(
        ERROR_CODES.DATABASE_ERROR,
        `決済ステータスの更新に失敗しました: ${rpcError.message}`
      );
    }

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
