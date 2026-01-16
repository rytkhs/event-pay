/**
 * Settlement Report Port Adapter
 * Core層のポートインターフェースにSettlement機能を提供するアダプタ
 */

import { createClient } from "@supabase/supabase-js";

import { registerSettlementReportPort } from "@core/ports/settlements";
import { getRequiredEnvVar } from "@core/utils/env-helper";

import { SettlementReportService } from "../services/service";

/**
 * Settlements機能のアダプタを登録
 */
export function registerSettlementsAdapters(): void {
  registerSettlementReportPort({
    async regenerateAfterRefundOrDispute(eventId: string, createdBy: string) {
      try {
        // Supabase service role client を作成
        const supabaseClient = createClient(
          getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
          getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );

        const service = new SettlementReportService(supabaseClient);
        return await service.regenerateAfterRefundOrDispute(eventId, createdBy);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error in settlement processing",
        };
      }
    },
  });
}
