/**
 * Settlement Report Port Adapter
 * Core層のポートインターフェースにSettlement機能を提供するアダプタ
 */

import { errFrom, mapResult } from "@core/errors";
import { registerSettlementReportPort } from "@core/ports/settlements";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { SettlementReportService } from "../services/service";

/**
 * Settlements機能のアダプタを登録
 */
export function registerSettlementsAdapters(): void {
  registerSettlementReportPort({
    async regenerateAfterRefundOrDispute(eventId: string, createdBy: string) {
      try {
        const factory = SecureSupabaseClientFactory.create();
        const supabaseClient = await factory.createAuditedAdminClient(
          AdminReason.PAYMENT_PROCESSING,
          `features/settlements/adapters/settlement-port.adapter regenerateAfterRefundOrDispute eventId=${eventId}`,
          { userId: createdBy }
        );

        const service = new SettlementReportService(supabaseClient);
        const result = await service.regenerateAfterRefundOrDispute(eventId, createdBy);
        return mapResult(result, (data) => ({
          reportId: data.reportId,
        }));
      } catch (error) {
        return errFrom(error, {
          defaultCode: "SETTLEMENT_REGENERATE_FAILED",
        });
      }
    },
  });
}
