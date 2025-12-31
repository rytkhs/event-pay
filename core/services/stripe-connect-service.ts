/**
 * Core Stripe Connect Service Abstraction
 * Payments→StripeConnect境界違反を解消するためのStripe Connect抽象化層
 * Portsパターンによる依存関係の逆転
 */

import { getStripeConnectPort, type StripeAccountStatus } from "@core/ports/stripe-connect";
import { handleServerError } from "@core/utils/error-handler.server";

// 型エイリアス（後方互換性のため）
export type StripeAccountStatusLike = StripeAccountStatus;

export interface IStripeConnectService {
  updateAccountFromWebhook(accountId: string, status: StripeAccountStatus): Promise<void>;
}

// Factory function using port
export function createStripeConnectService(): IStripeConnectService {
  return {
    async updateAccountFromWebhook(accountId: string, status: StripeAccountStatus) {
      try {
        const port = getStripeConnectPort();
        return await port.updateAccountFromWebhook(accountId, status);
      } catch (error) {
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "service_operation",
          actorType: "system",
          additionalData: {
            account_id: accountId,
            error_name: error instanceof Error ? error.name : "Unknown",
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
  };
}
