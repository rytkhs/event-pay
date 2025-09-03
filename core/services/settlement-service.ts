/**
 * Core Settlement Service Abstraction
 * Payments→Settlements境界違反を解消するための精算サービス抽象化層
 * Portsパターンによる依存関係の逆転
 */

import { getSettlementReportPort } from "@core/ports/settlements";

export interface SettlementServicePort {
  regenerateAfterRefundOrDispute(
    eventId: string,
    createdBy: string
  ): Promise<{
    success: boolean;
    error?: string;
    reportId?: string;
  }>;
}

// Factory function using port
export function createSettlementService(): SettlementServicePort {
  return {
    async regenerateAfterRefundOrDispute(eventId: string, createdBy: string) {
      try {
        const port = getSettlementReportPort();
        return await port.regenerateAfterRefundOrDispute(eventId, createdBy);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
}

// Simplified access function
export function getSettlementService(): SettlementServicePort {
  return createSettlementService();
}
