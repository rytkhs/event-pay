"use server";

import { z } from "zod";

import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  type ErrorCode,
} from "@core/types/server-actions";

import { PaymentValidator } from "../validation";

const inputSchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1).max(50), // 最大50件まで
  status: z.enum(["received", "waived"]),
  notes: z.string().max(1000).optional(),
});

type BulkUpdateResult = {
  successCount: number;
  failedCount: number;
  failures: Array<{
    paymentId: string;
    error: string;
  }>;
};

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
    default:
      return "INTERNAL_ERROR";
  }
}

export async function bulkUpdateCashStatusAction(
  input: unknown
): Promise<ServerActionResult<BulkUpdateResult>> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createServerActionError("VALIDATION_ERROR", "入力データが無効です。", {
        details: { zodErrors: parsed.error.errors },
      });
    }
    const { paymentIds, status, notes } = parsed.data;

    const factory = SecureSupabaseClientFactory.getInstance();
    const supabase = await factory.createAuthenticatedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です。");
    }

    // レート制限（ユーザー単位、一括更新用の制限）
    try {
      const key = buildKey({ scope: "payment.statusUpdate", userId: user.id });
      const rl = await enforceRateLimit({
        keys: Array.isArray(key) ? key : [key],
        policy: POLICIES["payment.statusUpdate"],
      });
      if (!rl.allowed) {
        return createServerActionError(
          "RATE_LIMITED",
          "レート制限に達しました。しばらく待ってから再試行してください。",
          rl.retryAfter
            ? { retryable: true, details: { retryAfter: rl.retryAfter } }
            : { retryable: true }
        );
      }
    } catch {
      // レート制限でのストア初期化失敗時はスキップ（安全側）
    }

    // 対象決済の一括取得（主催者権限チェック用）
    const { data: paymentsWithEvent, error: fetchError } = await supabase
      .from("payments")
      .select(
        `
        id,
        method,
        status,
        version,
        attendance_id,
        attendances!inner (
          id,
          event_id,
          events!inner (
            id,
            created_by
          )
        )
      `
      )
      .in("id", paymentIds);

    if (fetchError) {
      return createServerActionError("DATABASE_ERROR", "決済レコードの取得に失敗しました。");
    }

    if (!paymentsWithEvent || paymentsWithEvent.length === 0) {
      return createServerActionError("NOT_FOUND", "決済レコードが見つかりません。");
    }

    // 権限チェック：すべての決済が同じユーザーのイベントに属していることを確認
    const unauthorizedPayments = paymentsWithEvent.filter((payment) => {
      const attendance = Array.isArray(payment.attendances)
        ? payment.attendances[0]
        : payment.attendances;
      const event = Array.isArray(attendance.events) ? attendance.events[0] : attendance.events;
      return event.created_by !== user.id;
    });

    if (unauthorizedPayments.length > 0) {
      return createServerActionError("FORBIDDEN", "この操作を実行する権限がありません。");
    }

    // 現金決済以外のフィルタリング
    const nonCashPayments = paymentsWithEvent.filter((p) => p.method !== "cash");

    // 部分成功を許容するため、非現金決済は failures に積むだけで処理続行
    const initialFailures: BulkUpdateResult["failures"] = nonCashPayments.map((p) => ({
      paymentId: p.id,
      error: "現金決済以外は手動更新できません。",
    }));

    // 現金決済のみを抽出
    const cashPayments = paymentsWithEvent.filter((p) => p.method === "cash");

    if (cashPayments.length === 0) {
      return createServerActionSuccess({
        successCount: 0,
        failedCount: initialFailures.length,
        failures: initialFailures,
      });
    }

    // 基本的なバリデーション（RPC関数内でも再実行される）
    const validator = new PaymentValidator(supabase);
    for (const payment of cashPayments) {
      await validator.validateUpdatePaymentStatusParams({
        paymentId: payment.id,
        status,
      });
    }

    // 一括更新用のデータを構築（version情報を含める）
    const updateData = cashPayments.map((payment) => ({
      payment_id: payment.id,
      expected_version: payment.version,
      new_status: status,
    }));

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "rpc_bulk_update_payment_status_safe",
      {
        p_payment_updates: updateData,
        p_user_id: user.id,
        p_notes: notes || null,
      }
    );

    if (rpcError) {
      return createServerActionError(
        "DATABASE_ERROR",
        `一括決済ステータス更新に失敗しました: ${rpcError.message}`
      );
    }

    // RPC結果をレスポンス形式に変換
    const rpcFailures: BulkUpdateResult["failures"] = (rpcResult.failures || []).map(
      (f: { payment_id: string; error_message: string }) => ({
        paymentId: f.payment_id,
        error: f.error_message,
      })
    );

    const result: BulkUpdateResult = {
      successCount: rpcResult.success_count || 0,
      failedCount: (rpcResult.failure_count || 0) + initialFailures.length,
      failures: [...initialFailures, ...rpcFailures],
    };

    return createServerActionSuccess(result);
  } catch (error) {
    if (error instanceof PaymentError) {
      return createServerActionError(mapPaymentError(error.type), error.message);
    }
    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      details: { originalError: error },
    });
  }
}
