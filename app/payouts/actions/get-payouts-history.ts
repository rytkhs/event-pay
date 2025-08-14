"use server";

import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PayoutService, PayoutValidator, PayoutErrorHandler } from "@/lib/services/payout";
import { StripeConnectService, StripeConnectErrorHandler } from "@/lib/services/stripe-connect";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { PayoutError, PayoutErrorType, type Payout } from "@/lib/services/payout/types";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
} from "@/lib/types/server-actions";

const inputSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  eventId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

type PayoutHistoryItem = {
  id: string;
  eventId: string;
  userId: string;
  totalStripeSales: number;
  totalStripeFee: number;
  platformFee: number;
  netPayoutAmount: number;
  status: Payout["status"];
  stripeTransferId: string | null;
  processedAt: string | null;
  createdAt: string;
  notes: string | null;
  isManual: boolean;
};

export async function getPayoutsHistoryAction(
  input: unknown
): Promise<ServerActionResult<{ items: PayoutHistoryItem[] }>> {
  try {
    // 1) 入力検証
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です。", {
        zodErrors: parsed.error.errors,
      });
    }

    const { status, eventId, limit, offset } = parsed.data;

    // 2) 認証チェック
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, "認証が必要です。");
    }

    // 3) サービス初期化（RLS適用: 認証済みクライアントを使用）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const userClient = secureFactory.createAuthenticatedClient();

    const stripeConnectService = new StripeConnectService(
      userClient as SupabaseClient<Database>,
      new StripeConnectErrorHandler()
    );

    const validator = new PayoutValidator(userClient as SupabaseClient<Database>, stripeConnectService);
    const errorHandler = new PayoutErrorHandler();
    const payoutService = new PayoutService(
      userClient as SupabaseClient<Database>,
      errorHandler,
      stripeConnectService,
      validator
    );

    // 4) 送金履歴取得
    const payouts = await payoutService.getPayoutHistory({
      userId: user.id,
      status,
      eventId,
      limit,
      offset,
    });

    // 5) 表示用にマッピング（手動/自動の区別を付与）
    const items: PayoutHistoryItem[] = payouts.map((p) => ({
      id: p.id,
      eventId: p.event_id,
      userId: p.user_id,
      totalStripeSales: p.total_stripe_sales,
      totalStripeFee: p.total_stripe_fee,
      platformFee: p.platform_fee,
      netPayoutAmount: p.net_payout_amount,
      status: p.status,
      stripeTransferId: p.stripe_transfer_id,
      processedAt: p.processed_at,
      createdAt: p.created_at,
      notes: p.notes,
      isManual: typeof p.notes === "string" ? p.notes.includes("手動実行") : false,
    }));

    return createSuccessResponse({ items });
  } catch (error) {
    if (error instanceof PayoutError) {
      // 主にDATABASE_ERRORを想定
      const code =
        error.type === PayoutErrorType.DATABASE_ERROR
          ? ERROR_CODES.DATABASE_ERROR
          : ERROR_CODES.INTERNAL_ERROR;
      return createErrorResponse(code, error.message);
    }
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "予期しないエラーが発生しました", {
      originalError: error,
    });
  }
}
