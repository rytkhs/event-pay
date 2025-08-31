"use server";

import { z } from "zod";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { PaymentValidator } from "@features/payments/services";
import { PaymentError, PaymentErrorType } from "@features/payments/services/types";
import { createRateLimitStore, checkRateLimit } from "@core/rate-limit";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  type ErrorCode,
} from "@core/types/server-actions";

const inputSchema = z.object({
  paymentId: z.string().uuid(),
  status: z.enum(["received", "waived"]),
  notes: z.string().max(1000).optional(),
});

function mapPaymentError(type: PaymentErrorType): ErrorCode {
  switch (type) {
    case PaymentErrorType.VALIDATION_ERROR:
      return "VALIDATION_ERROR";
    case PaymentErrorType.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case PaymentErrorType.FORBIDDEN:
      return "FORBIDDEN";
    case PaymentErrorType.INVALID_AMOUNT:
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
    case PaymentErrorType.INVALID_STATUS_TRANSITION:
      return "RESOURCE_CONFLICT";
    case PaymentErrorType.EVENT_NOT_FOUND:
    case PaymentErrorType.ATTENDANCE_NOT_FOUND:
    case PaymentErrorType.PAYMENT_NOT_FOUND:
      return "NOT_FOUND";
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
      return "RESOURCE_CONFLICT";
    case PaymentErrorType.CONCURRENT_UPDATE:
      return "RESOURCE_CONFLICT";
    case PaymentErrorType.DATABASE_ERROR:
      return "DATABASE_ERROR";
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
    default:
      return "INTERNAL_ERROR";
  }
}

export async function updateCashStatusAction(
  input: unknown
): Promise<ServerActionResult<{ paymentId: string; status: "received" | "waived" }>> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createServerActionError("VALIDATION_ERROR", "入力データが無効です。", {
        details: { zodErrors: parsed.error.errors },
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
      return createServerActionError("UNAUTHORIZED", "認証が必要です。");
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
        return createServerActionError(
          "RATE_LIMITED",
          "レート制限に達しました。しばらく待ってから再試行してください。",
          rl.retryAfter ? { retryable: true, details: { retryAfter: rl.retryAfter } } : { retryable: true }
        );
      }
    } catch {
      // レート制限でのストア初期化失敗時はスキップ（安全側）
    }

    // 対象決済の取得（権限・バージョン・メソッド判定をまとめて取得）
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select(`
        id,
        version,
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
      `)
      .eq("id", paymentId)
      .single();

    if (fetchError || !payment) {
      return createServerActionError("NOT_FOUND", "決済レコードが見つかりません。");
    }

    // 基本的な権限チェック（RPC関数内でも再チェックされる）
    await new PaymentValidator(supabase).validateAttendanceAccess(
      payment.attendance_id,
      user.id
    );

    // 権限チェック：主催者のみ
    const attendance = Array.isArray(payment.attendances) ? payment.attendances[0] : payment.attendances;
    const event = Array.isArray(attendance.events) ? attendance.events[0] : attendance.events;

    if (event.created_by !== user.id) {
      return createServerActionError("FORBIDDEN", "この操作を実行する権限がありません。");
    }

    // 現金決済のみ
    if (payment.method !== "cash") {
      return createServerActionError(
        "RESOURCE_CONFLICT",
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
        return createServerActionError(mapPaymentError(validationError.type), validationError.message);
      }
      return createServerActionError(
        "INTERNAL_ERROR",
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
      p_expected_version: payment.version,
      p_user_id: user.id,
      p_notes: notes || null,
    });

    if (rpcError) {
      // 楽観的ロック競合の場合
      if (rpcError.code === '40001') {
        return createServerActionError(
          "RESOURCE_CONFLICT",
          "他のユーザーによって同時に更新されました。最新の状態を確認してから再試行してください。"
        );
      }

      return createServerActionError(
        "DATABASE_ERROR",
        `決済ステータスの更新に失敗しました: ${rpcError.message}`
      );
    }

    return createServerActionSuccess({ paymentId, status });
  } catch (error) {
    if (error instanceof PaymentError) {
      return createServerActionError(mapPaymentError(error.type), error.message);
    }
    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      details: { originalError: error },
    });
  }
}
