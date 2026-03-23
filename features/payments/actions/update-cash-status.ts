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

import { getOwnedPaymentActionContextForServerAction } from "../services/get-owned-payment-action-context";
import { PaymentValidator, updateCashStatusActionInputSchema } from "../validation";

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
): Promise<ActionResult<{ paymentId: string; status: "received" | "waived" | "pending" }>> {
  try {
    const parsed = updateCashStatusActionInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", {
        userMessage: "入力データが無効です。",
        details: { zodErrors: parsed.error.errors },
      });
    }
    const { paymentId, status, notes, isCancel } = parsed.data;

    const supabase = await createServerActionSupabaseClient();
    const accessResult = await getOwnedPaymentActionContextForServerAction(supabase, paymentId);
    if (!accessResult.success) {
      return toActionResultFromAppResult(accessResult);
    }

    const accessContext = accessResult.data;
    if (!accessContext) {
      return fail("INTERNAL_ERROR", { userMessage: "決済レコードの取得に失敗しました。" });
    }

    const { user, attendanceId, method, version } = accessContext;

    // レート制限（ユーザー単位）
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

    // 基本的な権限チェック（RPC関数内でも再チェックされる）
    await new PaymentValidator(supabase).validateAttendanceAccess(attendanceId);

    // 現金決済のみ
    if (method !== "cash") {
      return fail("RESOURCE_CONFLICT", { userMessage: "現金決済以外は手動更新できません。" });
    }

    // ステータス遷移などのビジネスルール検証
    try {
      await new PaymentValidator(supabase).validateUpdatePaymentStatusParams(
        {
          paymentId,
          status,
        },
        isCancel
      );
    } catch (validationError) {
      if (validationError instanceof PaymentError) {
        return fail(mapPaymentError(validationError.type), {
          userMessage: validationError.message,
        });
      }
      return fail("INTERNAL_ERROR", {
        userMessage: "ステータス検証中に予期しないエラーが発生しました。",
      });
    }

    const { data: _rpcResult, error: rpcError } = await supabase.rpc(
      "rpc_update_payment_status_safe",
      {
        p_payment_id: paymentId,
        p_new_status: status,
        p_expected_version: version,
        p_user_id: user.id,
        p_notes: notes,
      }
    );

    if (rpcError) {
      // 楽観的ロック競合の場合
      if (rpcError.code === "40001") {
        return fail("RESOURCE_CONFLICT", {
          userMessage:
            "他のユーザーによって同時に更新されました。最新の状態を確認してから再試行してください。",
        });
      }

      return fail("DATABASE_ERROR", {
        userMessage: `決済ステータスの更新に失敗しました: ${rpcError.message}`,
      });
    }

    return ok({ paymentId, status });
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
