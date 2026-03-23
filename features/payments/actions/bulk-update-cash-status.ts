import {
  type ActionResult,
  fail,
  ok,
  toActionResultFromAppResult,
} from "@core/errors/adapters/server-actions";
import type { ErrorCode } from "@core/errors/types";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { getOwnedBulkPaymentActionContextForServerAction } from "../services/get-owned-payment-action-context";
import { PaymentValidator, bulkUpdateCashStatusActionInputSchema } from "../validation";

type BulkUpdateResult = {
  successCount: number;
  failedCount: number;
  failures: Array<{
    paymentId: string;
    error: string;
  }>;
};

type BulkUpdatePaymentStatusRpcResult = {
  success_count: number;
  failure_count: number;
  failures: Array<{
    payment_id: string;
    error_message: string;
  }>;
};

function isBulkUpdatePaymentStatusRpcResult(
  value: unknown
): value is BulkUpdatePaymentStatusRpcResult {
  if (typeof value !== "object" || value === null) return false;
  const maybe = value as Record<string, unknown>;
  if (typeof maybe.success_count !== "number") return false;
  if (typeof maybe.failure_count !== "number") return false;
  if (!Array.isArray(maybe.failures)) return false;

  return maybe.failures.every((failure) => {
    if (typeof failure !== "object" || failure === null) return false;
    const f = failure as Record<string, unknown>;
    return typeof f.payment_id === "string" && typeof f.error_message === "string";
  });
}

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
): Promise<ActionResult<BulkUpdateResult>> {
  try {
    const parsed = bulkUpdateCashStatusActionInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: "入力データが無効です。",
        details: { zodErrors: parsed.error.errors },
      });
    }
    const { paymentIds, status, notes } = parsed.data;

    const supabase = await createServerActionSupabaseClient();
    const accessResult = await getOwnedBulkPaymentActionContextForServerAction(
      supabase,
      paymentIds
    );
    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", { userMessage: "決済レコードの取得に失敗しました。" });
    }

    const { user, payments: paymentsWithEvent } = accessContext;

    // レート制限（ユーザー単位、一括更新用の制限）
    try {
      const key = buildKey({ scope: "payment.statusUpdate", userId: user.id });
      const rl = await enforceRateLimit({
        keys: Array.isArray(key) ? key : [key],
        policy: POLICIES["payment.statusUpdate"],
      });
      if (!rl.allowed) {
        return fail("RATE_LIMITED", {
          userMessage: "レート制限に達しました。しばらく待ってから再試行してください。",
          retryable: true,
          details: rl.retryAfter ? { retryAfter: rl.retryAfter } : undefined,
        });
      }
    } catch {
      // レート制限でのストア初期化失敗時はスキップ（安全側）
    }

    // 現金決済以外のフィルタリング
    const nonCashPayments = paymentsWithEvent.filter((payment) => payment.method !== "cash");

    // 部分成功を許容するため、非現金決済は failures に積むだけで処理続行
    const initialFailures: BulkUpdateResult["failures"] = nonCashPayments.map((payment) => ({
      paymentId: payment.paymentId,
      error: "現金決済以外は手動更新できません。",
    }));

    // 現金決済のみを抽出
    const cashPayments = paymentsWithEvent.filter((payment) => payment.method === "cash");

    if (cashPayments.length === 0) {
      return ok({
        successCount: 0,
        failedCount: initialFailures.length,
        failures: initialFailures,
      });
    }

    // 基本的なバリデーション（RPC関数内でも再実行される）
    const validator = new PaymentValidator(supabase);
    for (const payment of cashPayments) {
      await validator.validateAttendanceAccess(payment.attendanceId);
      await validator.validateUpdatePaymentStatusParams({
        paymentId: payment.paymentId,
        status,
      });
    }

    // 一括更新用のデータを構築（version情報を含める）
    const updateData = cashPayments.map((payment) => ({
      payment_id: payment.paymentId,
      expected_version: payment.version,
      new_status: status,
    }));

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "rpc_bulk_update_payment_status_safe",
      {
        p_payment_updates: updateData,
        p_user_id: user.id,
        p_notes: notes,
      }
    );

    if (rpcError) {
      return fail("DATABASE_ERROR", {
        userMessage: `一括決済ステータス更新に失敗しました: ${rpcError.message}`,
      });
    }

    if (!isBulkUpdatePaymentStatusRpcResult(rpcResult)) {
      return fail("DATABASE_ERROR", {
        userMessage: "一括決済ステータス更新の結果形式が不正です。",
      });
    }

    // RPC結果をレスポンス形式に変換
    const rpcFailures: BulkUpdateResult["failures"] = rpcResult.failures.map(
      (f: { payment_id: string; error_message: string }) => ({
        paymentId: f.payment_id,
        error: f.error_message,
      })
    );

    const result: BulkUpdateResult = {
      successCount: rpcResult.success_count,
      failedCount: rpcResult.failure_count + initialFailures.length,
      failures: [...initialFailures, ...rpcFailures],
    };

    return ok(result);
  } catch (error) {
    if (error instanceof PaymentError) {
      return fail(mapPaymentError(error.type), { userMessage: error.message });
    }
    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
      details: { originalError: error },
    });
  }
}
