"use server";

import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { PayoutService, PayoutValidator, PayoutErrorHandler } from "@/lib/services/payout";
import { StripeConnectService, StripeConnectErrorHandler } from "@/lib/services/stripe-connect";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  type ErrorCode,
} from "@/lib/types/server-actions";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";

import { DEFAULT_PAYOUT_DAYS_AFTER_EVENT } from "@/lib/services/payout/constants";

const inputSchema = z.object({
  eventId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

function mapPayoutError(type: PayoutErrorType): ErrorCode {
  switch (type) {
    case PayoutErrorType.VALIDATION_ERROR:
      return ERROR_CODES.VALIDATION_ERROR;
    case PayoutErrorType.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case PayoutErrorType.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case PayoutErrorType.EVENT_NOT_FOUND:
    case PayoutErrorType.PAYOUT_NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case PayoutErrorType.PAYOUT_ALREADY_EXISTS:
      return ERROR_CODES.CONFLICT;
    case PayoutErrorType.EVENT_NOT_ELIGIBLE:
    case PayoutErrorType.STRIPE_ACCOUNT_NOT_READY:
    case PayoutErrorType.INSUFFICIENT_BALANCE:
    case PayoutErrorType.INVALID_STATUS_TRANSITION:
      return ERROR_CODES.BUSINESS_RULE_VIOLATION;
    case PayoutErrorType.DATABASE_ERROR:
      return ERROR_CODES.DATABASE_ERROR;
    case PayoutErrorType.STRIPE_API_ERROR:
    case PayoutErrorType.STRIPE_CONNECT_ERROR:
    case PayoutErrorType.TRANSFER_CREATION_FAILED:
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

/**
 * 手動送金処理Server Action
 * 要件8.5, 8.6, 8.7に基づく実装
 */
export async function processManualPayoutAction(
  input: unknown
): Promise<ServerActionResult<{
  payoutId: string;
  transferId: string | null;
  netAmount: number;
  estimatedArrival?: string;
  isManual: boolean;
}>> {
  try {
    // 1. 入力データの検証
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です。", {
        zodErrors: parsed.error.errors,
      });
    }
    const { eventId, notes } = parsed.data;

    // 2. 認証チェック
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, "認証が必要です。");
    }

    // 3. レート制限（ユーザー単位）
    try {
      const store = await createRateLimitStore();
      const rl = await checkRateLimit(
        store,
        `manual_payout_${user.id}`,
        RATE_LIMIT_CONFIG.manualPayout || {
          requests: 3,
          window: "1m",
        }
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

    // 4. サービスクラスの初期化（監査付き管理者クライアントを使用）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = (await secureFactory.createAuditedAdminClient(
      AdminReason.PAYOUT_PROCESSING,
      "server-actions/process-manual-payout"
    )) as SupabaseClient<Database>;

    const stripeConnectService = new StripeConnectService(
      adminClient,
      new StripeConnectErrorHandler()
    );

    const validator = new PayoutValidator(adminClient, stripeConnectService);

    const errorHandler = new PayoutErrorHandler();

    const payoutService = new PayoutService(
      adminClient,
      errorHandler,
      stripeConnectService,
      validator
    );

    // 5. 手動送金実行条件の統合検証（要件8.1-8.4）
    const eligibilityResult = await payoutService.validateManualPayoutEligibility({
      eventId,
      userId: user.id,
      daysAfterEvent: DEFAULT_PAYOUT_DAYS_AFTER_EVENT,
    });

    if (!eligibilityResult.eligible) {
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "手動送金の実行条件を満たしていません。",
        {
          reasons: eligibilityResult.reasons,
          details: eligibilityResult.details,
        }
      );
    }

    // 6. 手動送金処理の実行（要件8.6, 8.7）
    const result = await payoutService.processPayout({
      eventId,
      userId: user.id,
      notes: notes ? `手動実行: ${notes}` : "手動実行",
    });

    // 7. 手動実行フラグの記録（要件8.7）
    // 送金レコードに手動実行フラグを追加
    await adminClient
      .from("payouts")
      .update({
        notes: notes ? `手動実行: ${notes}` : "手動実行",
        updated_at: new Date().toISOString(),
      })
      .eq("id", result.payoutId);

    // 8. 監査ログの記録
    await adminClient.from("system_logs").insert({
      operation_type: "manual_payout_execution",
      details: {
        payoutId: result.payoutId,
        eventId,
        userId: user.id,
        transferId: result.transferId,
        netAmount: result.netAmount,
        notes: notes || null,
        eligibilityDetails: eligibilityResult.details,
      },
    });

    return createSuccessResponse({
      payoutId: result.payoutId,
      transferId: result.transferId,
      netAmount: result.netAmount,
      estimatedArrival: result.estimatedArrival,
      isManual: true,
    });

  } catch (error) {
    if (error instanceof PayoutError) {
      return createErrorResponse(mapPayoutError(error.type), error.message, {
        payoutErrorType: error.type,
        cause: error.cause,
        metadata: error.metadata,
      });
    }

    // 予期しないエラーの場合は監査ログに記録
    try {
      const secureFactory = SecureSupabaseClientFactory.getInstance();
      const adminClient = (await secureFactory.createAuditedAdminClient(
        AdminReason.PAYOUT_PROCESSING,
        "server-actions/process-manual-payout:error"
      )) as SupabaseClient<Database>;
      await adminClient.from("system_logs").insert({
        operation_type: "manual_payout_error",
        details: {
          eventId: typeof input === 'object' && input !== null && 'eventId' in input
            ? String((input as { eventId: unknown }).eventId)
            : undefined,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        } as Json,
      });
    } catch {
      // ログ記録失敗は無視
    }

    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "予期しないエラーが発生しました", {
      originalError: error,
    });
  }
}
