/**
 * Core Settlement Service Abstraction
 * Payments→Settlements境界違反を解消するための精算サービス抽象化層
 * Portsパターンによる依存関係の逆転
 */

import { errFrom } from "@core/errors";
import type { AppResult } from "@core/errors";
import { getSettlementReportPort } from "@core/ports/settlements";

export interface SettlementServicePort {
  regenerateAfterRefundOrDispute(
    eventId: string,
    createdBy: string
  ): Promise<AppResult<{ reportId?: string }>>;
}

// Factory function using port
export function createSettlementService(): SettlementServicePort {
  return {
    async regenerateAfterRefundOrDispute(eventId: string, createdBy: string) {
      try {
        const port = getSettlementReportPort();
        return await port.regenerateAfterRefundOrDispute(eventId, createdBy);
      } catch (error) {
        return errFrom(error, {
          defaultCode: "SETTLEMENT_REGENERATE_FAILED",
        });
      }
    },
  };
}

// Simplified access function
export function getSettlementService(): SettlementServicePort {
  return createSettlementService();
}
