/**
 * SettlementServiceの基本実装
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

export interface SettlementHistoryItem {
  id: string;
  event_id: string;
  user_id: string;
  total_stripe_sales: number;
  total_stripe_fee: number;
  platform_fee: number;
  net_payout_amount: number;
  status: Database["public"]["Enums"]["payout_status_enum"];
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  transfer_group: string | null;
}

export class SettlementHistoryService {
  constructor(private supabase: SupabaseClient<Database>) { }

  async getPayoutHistory(
    userId: string,
    opts: {
      limit?: number;
      offset?: number;
      status?: Database["public"]["Enums"]["payout_status_enum"];
      eventId?: string;
    } = {}
  ): Promise<SettlementHistoryItem[]> {
    const { limit = 50, offset = 0, status, eventId } = opts;

    let query = this.supabase
      .from("settlements")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (eventId) query = query.eq("event_id", eventId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch payout history: ${error.message}`);
    return (data || []) as SettlementHistoryItem[];
  }
}
