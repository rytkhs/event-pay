/**
 * Core Payment Actions Abstraction
 * features間の境界違反を解消するための決済アクション抽象化層
 */

import type { ServerActionResult } from "@core/types/server-actions";

import registry from "./payment-registry";
import type {
  UpdateCashStatusParams,
  BulkUpdateCashStatusParams,
  BulkUpdateResult,
} from "./payment-registry";

// Payment Actions の抽象化インターフェース
export interface PaymentActionsPort {
  updateCashStatus(params: UpdateCashStatusParams): Promise<ServerActionResult<any>>;
  bulkUpdateCashStatus(
    params: BulkUpdateCashStatusParams
  ): Promise<ServerActionResult<BulkUpdateResult>>;
}

// Re-export types from registry
export type { UpdateCashStatusParams, BulkUpdateCashStatusParams, BulkUpdateResult };

// Factory function for Payment Actions - uses registry instead of dynamic imports
export function createPaymentActions(): PaymentActionsPort {
  return {
    async updateCashStatus(params: UpdateCashStatusParams) {
      const impl = registry.getPaymentActions();
      return impl.updateCashStatus(params);
    },

    async bulkUpdateCashStatus(params: BulkUpdateCashStatusParams) {
      const impl = registry.getPaymentActions();
      return impl.bulkUpdateCashStatus(params);
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
