/**
 * Core Payment Actions Abstraction
 * features間の境界違反を解消するための決済アクション抽象化層
 */

import {
  getPaymentPort,
  type UpdateCashStatusParams,
  type BulkUpdateCashStatusParams,
  type BulkUpdateResult,
} from "@core/ports/payments";
import type { ServerActionResult } from "@core/types/server-actions";

// Payment Actions の抽象化インターフェース
export interface PaymentActionsPort {
  updateCashStatus(params: UpdateCashStatusParams): Promise<ServerActionResult<any>>;
  bulkUpdateCashStatus(
    params: BulkUpdateCashStatusParams
  ): Promise<ServerActionResult<BulkUpdateResult>>;
}

// Re-export types from ports
export type { UpdateCashStatusParams, BulkUpdateCashStatusParams, BulkUpdateResult };

// Factory function for Payment Actions - uses port instead of dynamic imports
export function createPaymentActions(): PaymentActionsPort {
  return {
    async updateCashStatus(params: UpdateCashStatusParams) {
      const port = getPaymentPort();
      return port.updateCashStatus(params);
    },

    async bulkUpdateCashStatus(params: BulkUpdateCashStatusParams) {
      const port = getPaymentPort();
      return port.bulkUpdateCashStatus(params);
    },
  };
}

// Singleton instance
let paymentActionsInstance: PaymentActionsPort | null = null;

export function getPaymentActions(): PaymentActionsPort {
  if (!paymentActionsInstance) {
    paymentActionsInstance = createPaymentActions();
  }
  return paymentActionsInstance;
}
