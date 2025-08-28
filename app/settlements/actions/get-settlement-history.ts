"use server";

import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { SettlementHistoryService } from "@/lib/services/settlement";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
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
  status: Database["public"]["Enums"]["payout_status_enum"];
  processedAt: string | null;
  createdAt: string;
  notes: string | null;
  isManual: boolean;
};

export async function getSettlementHistoryAction(
  input: unknown
): Promise<ServerActionResult<{ items: PayoutHistoryItem[] }>> {
  try {
    // 1) 入力検証
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return createServerActionError("VALIDATION_ERROR", "入力データが無効です。", {
        details: { zodErrors: parsed.error.errors },
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
      return createServerActionError("UNAUTHORIZED", "認証が必要です。");
    }

    // 3) サービス初期化（RLS適用: 認証済みクライアントを使用）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const userClient = secureFactory.createAuthenticatedClient();

    const settlementHistoryService = new SettlementHistoryService(userClient as SupabaseClient<Database>);

    // 4) 送金履歴取得
    const payouts = await settlementHistoryService.getPayoutHistory(user.id, {
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
      processedAt: p.processed_at,
      createdAt: p.created_at,
      notes: p.notes,
      isManual: typeof p.notes === "string" ? p.notes.includes("手動実行") : false,
    }));

    return createServerActionSuccess({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return createServerActionError("DATABASE_ERROR", message);
  }
}
